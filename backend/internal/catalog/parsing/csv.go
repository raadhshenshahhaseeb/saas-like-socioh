package parsing

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"io"
	"strings"
	"unicode"
	"unicode/utf8"

	"example.com/catalog-workflow/backend/internal/catalog/model"
)

// CSV reads a bounded document; it never creates files or interprets input text as instructions.
func CSV(ctx context.Context, input io.Reader, maxBytes int64, maxRows int) ([]model.Product, error) {
	data, err := io.ReadAll(io.LimitReader(&contextReader{ctx: ctx, reader: input}, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, model.NewFault("input_limit", "The CSV exceeds the file size limit.")
	}
	if !utf8.Valid(data) {
		return nil, model.NewFault("validation_error", "The CSV must contain valid UTF-8 text.")
	}
	data = bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf})
	reader := csv.NewReader(bytes.NewReader(data))
	reader.FieldsPerRecord = -1
	headers, err := reader.Read()
	if err != nil || len(headers) != len(model.Columns) {
		return nil, model.NewFault("validation_error", "The CSV requires exactly the five supported headers.")
	}
	indices := make(map[string]int, len(headers))
	for i, header := range headers {
		if _, exists := indices[header]; exists {
			return nil, model.NewFault("validation_error", "The CSV contains a duplicate header.")
		}
		indices[header] = i
	}
	for _, name := range model.Columns {
		if _, exists := indices[name]; !exists {
			return nil, model.NewFault("validation_error", "The CSV requires exactly the five supported headers.")
		}
	}
	products := []model.Product{}
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil || len(record) != len(headers) {
			fault := model.NewFault("validation_error", "The CSV contains malformed quoting or an unequal record width.")
			fault.Details = []model.Issue{{Code: "invalid_csv", Row: len(products) + 1, Message: "Use valid CSV with five fields per record."}}
			return nil, fault
		}
		if len(products) == maxRows {
			return nil, model.NewFault("input_limit", "The CSV exceeds the product row limit.")
		}
		sku := record[indices["sku"]]
		title := record[indices["title"]]
		if strings.ContainsFunc(sku, unicode.IsControl) || strings.ContainsFunc(title, unicode.IsControl) {
			return nil, model.NewFault("validation_error", "Product SKUs and titles cannot contain control characters.")
		}
		products = append(products, model.Product{
			SKU: strings.TrimSpace(sku), Title: strings.TrimSpace(title),
			Price: strings.TrimSpace(record[indices["price"]]), Currency: strings.TrimSpace(record[indices["currency"]]),
			Availability: strings.TrimSpace(record[indices["availability"]]),
		})
	}
	if len(products) == 0 {
		return nil, model.NewFault("validation_error", "The CSV must contain at least one product.")
	}
	return products, nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r *contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}
