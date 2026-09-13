//go:build integration

package httpapi_test

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"example.com/catalog-workflow/backend/internal/app"
	"example.com/catalog-workflow/backend/internal/catalog/model"
	"example.com/catalog-workflow/backend/internal/config"
	"example.com/catalog-workflow/backend/internal/connector/source/mock"
	"example.com/catalog-workflow/backend/internal/testsupport"
	"example.com/catalog-workflow/backend/migrations"
)

func TestCatalogAcceptance(t *testing.T) {
	runtimeURL, migrationURL := testsupport.DatabaseURLs(t)
	if err := migrations.Up(t.Context(), migrationURL); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Reset(t.Context(), migrationURL, "catalog_integration", config.DemoWorkspaceID); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(func(key string) string {
		if key == "DATABASE_URL" {
			return runtimeURL
		}
		return ""
	})
	if err != nil {
		t.Fatal(err)
	}
	application, err := app.New(t.Context(), cfg, mock.BuiltIn())
	if err != nil {
		t.Fatal(err)
	}
	defer application.Close()
	t.Run("H1 happy sample preview equals exported values", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodPost, "/v1/catalog/runs", strings.NewReader(`{"sample_id":"catalog-basic-v1","title_prefix":"Demo: ","exclude_unavailable":true}`))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		application.Handler.ServeHTTP(response, request)
		if response.Code != 201 {
			t.Fatalf("sample status %d: %s", response.Code, response.Body)
		}
		var body struct {
			Run model.Run `json:"run"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.Run.Counts == nil || *body.Run.Counts != (model.Counts{Input: 4, Included: 3, Excluded: 1}) {
			t.Fatal("unexpected sample counts")
		}
		if body.Run.Preview.Rows[0].Title != `Demo: Desk, "Studio" Edition` || body.Run.Preview.Rows[2].Price != "99999999999999.9999" {
			t.Fatal("sample values changed")
		}
		exported := httptest.NewRecorder()
		application.Handler.ServeHTTP(exported, httptest.NewRequest(http.MethodGet, "/v1/catalog/runs/"+body.Run.ID+"/export", nil))
		if exported.Code != 200 {
			t.Fatal("export failed")
		}
		rows, err := csv.NewReader(exported.Body).ReadAll()
		if err != nil || len(rows) != 4 || rows[1][1] != body.Run.Preview.Rows[0].Title || rows[3][2] != "99999999999999.9999" {
			t.Fatal("decoded export differs from the expected sample")
		}
	})
	t.Run("H2 happy upload follows the same pipeline and result survives restart", func(t *testing.T) {
		input, err := mock.BuiltIn().Open(t.Context(), mock.SampleID)
		if err != nil {
			t.Fatal(err)
		}
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, err := writer.CreateFormFile("file", "synthetic.csv")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.Copy(part, input); err != nil {
			t.Fatal(err)
		}
		if err := input.Close(); err != nil {
			t.Fatal(err)
		}
		if err := writer.WriteField("title_prefix", "Demo: "); err != nil {
			t.Fatal(err)
		}
		if err := writer.WriteField("exclude_unavailable", "true"); err != nil {
			t.Fatal(err)
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		request := httptest.NewRequest(http.MethodPost, "/v1/catalog/runs", &body)
		request.Header.Set("Content-Type", writer.FormDataContentType())
		response := httptest.NewRecorder()
		application.Handler.ServeHTTP(response, request)
		if response.Code != 201 {
			t.Fatalf("upload status %d: %s", response.Code, response.Body)
		}
		var value struct {
			Run model.Run `json:"run"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &value); err != nil {
			t.Fatal(err)
		}
		wantCounts := model.Counts{Input: 4, Included: 3, Excluded: 1}
		if value.Run.Counts == nil || *value.Run.Counts != wantCounts || value.Run.Preview.Rows[1].Price != "7.5" {
			t.Fatal("upload differs from the sample result")
		}
		restarted, err := app.New(t.Context(), cfg, mock.BuiltIn())
		if err != nil {
			t.Fatal(err)
		}
		defer restarted.Close()
		result := httptest.NewRecorder()
		restarted.Handler.ServeHTTP(result, httptest.NewRequest(http.MethodGet, "/v1/catalog/runs/"+value.Run.ID, nil))
		if result.Code != 200 || !strings.Contains(result.Body.String(), "99999999999999.9999") {
			t.Fatal("completed result did not survive reconstruction")
		}
	})
	t.Run("S1 sad invalid envelope cannot produce output", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodPost, "/v1/catalog/runs", strings.NewReader(`{"sample_id":"catalog-basic-v1","sample_id":"catalog-basic-v1"}`))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		application.Handler.ServeHTTP(response, request)
		if response.Code != 400 || !strings.Contains(response.Body.String(), "invalid_request") {
			t.Fatal("duplicate JSON keys were not rejected")
		}
		var invalid bytes.Buffer
		form := multipart.NewWriter(&invalid)
		file, err := form.CreateFormFile("file", "synthetic-invalid.csv")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.WriteString(file, "sku,title,price,currency,availability\nITEM-1,Sample,not-a-price,USD,out_of_stock\n"); err != nil {
			t.Fatal(err)
		}
		if err := form.WriteField("exclude_unavailable", "true"); err != nil {
			t.Fatal(err)
		}
		if err := form.Close(); err != nil {
			t.Fatal(err)
		}
		badRequest := httptest.NewRequest(http.MethodPost, "/v1/catalog/runs", &invalid)
		badRequest.Header.Set("Content-Type", form.FormDataContentType())
		badResponse := httptest.NewRecorder()
		application.Handler.ServeHTTP(badResponse, badRequest)
		var failure struct {
			Error model.Fault `json:"error"`
		}
		if err := json.Unmarshal(badResponse.Body.Bytes(), &failure); err != nil {
			t.Fatal(err)
		}
		if badResponse.Code != 422 || failure.Error.RunID == "" {
			t.Fatalf("wrong row failure: %d %s", badResponse.Code, badResponse.Body)
		}
		noExport := httptest.NewRecorder()
		application.Handler.ServeHTTP(noExport, httptest.NewRequest(http.MethodGet, "/v1/catalog/runs/"+failure.Error.RunID+"/export", nil))
		if noExport.Code != 409 {
			t.Fatal("invalid excluded row produced a completed export")
		}
	})
	t.Run("S2 sad source failure is persisted and never exportable", func(t *testing.T) {
		base := mock.BuiltIn()
		failedSource := mock.New(mock.WithList(base.List), mock.WithOpen(func(context.Context, string) (io.ReadCloser, error) {
			return nil, errors.New("private source exception must not leak")
		}))
		failedApp, err := app.New(t.Context(), cfg, failedSource)
		if err != nil {
			t.Fatal(err)
		}
		defer failedApp.Close()
		request := httptest.NewRequest(http.MethodPost, "/v1/catalog/runs", strings.NewReader(`{"sample_id":"catalog-basic-v1"}`))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		failedApp.Handler.ServeHTTP(response, request)
		var value struct {
			Error model.Fault `json:"error"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &value); err != nil {
			t.Fatal(err)
		}
		if response.Code != 503 || value.Error.Code != "source_unavailable" || value.Error.RunID == "" {
			t.Fatalf("incorrect source outcome: %d %s", response.Code, response.Body)
		}
		if strings.Contains(response.Body.String(), "private source exception") {
			t.Fatal("raw source error leaked")
		}
		exported := httptest.NewRecorder()
		failedApp.Handler.ServeHTTP(exported, httptest.NewRequest(http.MethodGet, "/v1/catalog/runs/"+value.Error.RunID+"/export", nil))
		if exported.Code != 409 {
			t.Fatal("failed run was exportable")
		}
	})
}
