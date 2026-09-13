package pipeline_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"example.com/catalog-workflow/backend/internal/catalog/export"
	"example.com/catalog-workflow/backend/internal/catalog/model"
	"example.com/catalog-workflow/backend/internal/catalog/pipeline"
)

func TestProcess(t *testing.T) {
	t.Run("prefix and exclusion preserve exact values and order", func(t *testing.T) {
		input := "sku,title,price,currency,availability\nITEM-1,Sample cup,0012.3400,USD,in_stock\nITEM-2,Sample plate,0.0000,USD,out_of_stock\n"
		result, err := pipeline.Process(context.Background(), strings.NewReader(input), model.Rules{
			TitlePrefix: "Demo: ", ExcludeUnavailable: true,
		}, pipeline.DefaultLimits())
		if err != nil {
			t.Fatal(err)
		}
		if result.Counts != (model.Counts{Input: 2, Included: 1, Excluded: 1}) {
			t.Fatalf("unexpected counts: %+v", result.Counts)
		}
		preview := model.Project(result.Items)
		want := model.Product{SKU: "ITEM-1", Title: "Demo: Sample cup", Price: "12.34", Currency: "USD", Availability: "in_stock"}
		if len(preview.Rows) != 1 || preview.Rows[0] != want {
			t.Fatalf("unexpected preview: %+v", preview)
		}
		if result.Items[0].Input.Title != "Sample cup" {
			t.Fatal("processing changed the original title")
		}
	})
}

func TestProcessSupportingValidation(t *testing.T) {
	const header = "sku,title,price,currency,availability\n"
	cases := []struct {
		name   string
		input  string
		prefix string
		limits pipeline.Limits
		code   string
	}{
		{name: "duplicate header", input: "sku,title,price,currency,sku\n", code: "validation_error"},
		{name: "header only is not successful empty output", input: header, code: "validation_error"},
		{name: "invalid excluded row still fails", input: header + "A,Sample,nope,USD,out_of_stock\n", code: "validation_error"},
		{name: "duplicate SKU", input: header + "A,First,1,USD,in_stock\nA,Second,2,USD,in_stock\n", code: "validation_error"},
		{name: "malformed quotes", input: header + "A,\"Broken,1,USD,in_stock\n", code: "validation_error"},
		{name: "invalid UTF8", input: header + "A,\xff,1,USD,in_stock\n", code: "validation_error"},
		{name: "negative price", input: header + "A,Sample,-1,USD,in_stock\n", code: "validation_error"},
		{name: "exponent price", input: header + "A,Sample,1e2,USD,in_stock\n", code: "validation_error"},
		{name: "overflow price", input: header + "A,Sample,100000000000000,USD,in_stock\n", code: "validation_error"},
		{name: "excess precision", input: header + "A,Sample,1.00001,USD,in_stock\n", code: "validation_error"},
		{name: "invalid currency", input: header + "A,Sample,1,usd,in_stock\n", code: "validation_error"},
		{name: "invalid availability", input: header + "A,Sample,1,USD,available\n", code: "validation_error"},
		{name: "unsafe input title", input: header + "A,=SUM(A1),1,USD,in_stock\n", code: "validation_error"},
		{name: "unsafe prefixed title even if excluded", input: header + "A,Sample,1,USD,out_of_stock\n", prefix: "=", code: "validation_error"},
		{name: "control character prefix", input: header + "A,Sample,1,USD,in_stock\n", prefix: "Demo:\t", code: "validation_error"},
		{name: "quoted SKU leading tab", input: header + "\"\tITEM-1\",Sample,1,USD,in_stock\n", code: "validation_error"},
		{name: "quoted SKU trailing tab", input: header + "\"ITEM-1\t\",Sample,1,USD,in_stock\n", code: "validation_error"},
		{name: "quoted multiline title", input: header + "A,\"line1\nline2\",1,USD,in_stock\n", code: "validation_error"},
		{name: "byte capacity", input: header + "A,Sample,1,USD,in_stock\n", limits: pipeline.Limits{Bytes: 10, Rows: 1000}, code: "input_limit"},
		{name: "row capacity", input: header + "A,First,1,USD,in_stock\nB,Second,2,USD,in_stock\n", limits: pipeline.Limits{Bytes: 1 << 20, Rows: 1}, code: "input_limit"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			limits := tc.limits
			if limits.Bytes == 0 {
				limits = pipeline.DefaultLimits()
			}
			result, err := pipeline.Process(t.Context(), strings.NewReader(tc.input), model.Rules{TitlePrefix: tc.prefix, ExcludeUnavailable: true}, limits)
			fault, ok := errors.AsType[*model.Fault](err)
			if !ok || fault.Code != tc.code || len(result.Items) != 0 {
				t.Fatalf("expected %s without results, got %v %+v", tc.code, err, result)
			}
		})
	}
}

func TestProcessAllFilteredAndCanonicalExport(t *testing.T) {
	input := "\xef\xbb\xbfavailability,currency,price,title,sku\r\nout_of_stock,USD,000.0000, Sample , ITEM-1 \r\n"
	result, err := pipeline.Process(t.Context(), strings.NewReader(input), model.Rules{ExcludeUnavailable: true}, pipeline.DefaultLimits())
	if err != nil {
		t.Fatal(err)
	}
	preview := model.Project(result.Items)
	if result.Counts != (model.Counts{Input: 1, Excluded: 1}) || len(preview.Rows) != 0 {
		t.Fatal("all-filtered result was not a valid empty projection")
	}
	data, err := export.CSV(t.Context(), preview)
	if err != nil || string(data) != "sku,title,price,currency,availability\n" {
		t.Fatal("all-filtered export is not the canonical header-only CSV")
	}
}

func TestProcessBoundsIssuesAndCancels(t *testing.T) {
	input := "sku,title,price,currency,availability\n" + strings.Repeat("A,,bad,usd,invalid\n", 40)
	_, err := pipeline.Process(t.Context(), strings.NewReader(input), model.Rules{}, pipeline.DefaultLimits())
	fault, ok := errors.AsType[*model.Fault](err)
	if !ok || len(fault.Details) != 100 || !fault.DetailsTruncated {
		t.Fatal("validation details were not capped explicitly")
	}
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, err = pipeline.Process(ctx, strings.NewReader(input), model.Rules{}, pipeline.DefaultLimits())
	if !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled processing did not stop")
	}
}
