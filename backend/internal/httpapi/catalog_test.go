package httpapi_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"example.com/catalog-workflow/backend/internal/catalog/model"
	"example.com/catalog-workflow/backend/internal/catalog/pipeline"
	"example.com/catalog-workflow/backend/internal/config"
	"example.com/catalog-workflow/backend/internal/connector"
	"example.com/catalog-workflow/backend/internal/connector/source"
	"example.com/catalog-workflow/backend/internal/connector/source/mock"
	"example.com/catalog-workflow/backend/internal/httpapi"
	"example.com/catalog-workflow/backend/internal/saas"
)

type gatedBody struct {
	reader    io.Reader
	started   chan struct{}
	release   chan struct{}
	startOnce sync.Once
	closeOnce sync.Once
}

func TestHandlerCancellationStopsBodyRead(t *testing.T) {
	cfg, err := config.Load(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	handler := httpapi.New(nil, func(context.Context) error { return nil }, cfg)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	body := &gatedBody{reader: strings.NewReader(`{}`), started: make(chan struct{}), release: make(chan struct{})}
	request := httptest.NewRequest(http.MethodPost, "/v1/catalog/runs", body).WithContext(ctx)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { handler.ServeHTTP(response, request); close(done) }()
	select {
	case <-body.started:
	case <-time.After(time.Second):
		t.Fatal("request body was not read")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cancelled body read did not stop")
	}
	if response.Code != 504 || !strings.Contains(response.Body.String(), "cancelled") {
		t.Fatal("cancellation was converted to a validation or success response")
	}
}

type unusedRepository struct{}

func (unusedRepository) Create(context.Context, model.Run, int) error {
	return errors.New("unexpected repository call")
}
func (unusedRepository) Complete(context.Context, string, string, model.Result) error {
	return errors.New("unexpected repository call")
}
func (unusedRepository) Fail(context.Context, string, string, *model.Fault) error {
	return errors.New("unexpected repository call")
}
func (unusedRepository) Get(context.Context, string, string) (model.Run, error) {
	return model.Run{}, errors.New("unexpected repository call")
}

func TestHandlerReadBulkhead(t *testing.T) {
	cfg, err := config.Load(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := saas.New(cfg.WorkspaceID)
	if err != nil {
		t.Fatal(err)
	}
	entered := make(chan struct{}, 4)
	release := make(chan struct{})
	var releaseOnce sync.Once
	t.Cleanup(func() { releaseOnce.Do(func() { close(release) }) })
	provider := mock.New(mock.WithList(func(ctx context.Context) ([]source.Descriptor, error) {
		entered <- struct{}{}
		select {
		case <-release:
			return []source.Descriptor{}, nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}))
	manager, err := connector.New(connector.Dependencies{Repository: unusedRepository{}, Workspace: workspace, Source: provider},
		connector.Config{MaxStoredRuns: 100, CleanupTimeout: 2 * time.Second, Limits: pipeline.DefaultLimits()})
	if err != nil {
		t.Fatal(err)
	}
	handler := httpapi.New(manager, func(context.Context) error { return nil }, cfg)
	done := make(chan struct{}, 4)
	for range 4 {
		go func() {
			handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/catalog/samples", nil))
			done <- struct{}{}
		}()
		select {
		case <-entered:
		case <-time.After(time.Second):
			t.Fatal("read request did not enter")
		}
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/v1/catalog/samples", nil))
	if response.Code != 429 {
		t.Fatal("read/export bulkhead did not reject excess work")
	}
	releaseOnce.Do(func() { close(release) })
	for range 4 {
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatal("read request did not release")
		}
	}
}

func (b *gatedBody) Read(data []byte) (int, error) {
	b.startOnce.Do(func() { close(b.started) })
	<-b.release
	return b.reader.Read(data)
}

func (b *gatedBody) Close() error {
	b.closeOnce.Do(func() { close(b.release) })
	return nil
}

type observedBody struct{ read atomic.Bool }

func (b *observedBody) Read([]byte) (int, error) { b.read.Store(true); return 0, io.EOF }

func TestHandlerAdmissionPrecedesBodyRead(t *testing.T) {
	cfg, err := config.Load(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	handler := httpapi.New(nil, func(context.Context) error { return nil }, cfg)
	bodies := []*gatedBody{}
	finished := make(chan struct{}, 2)
	for range 2 {
		body := &gatedBody{reader: strings.NewReader(`{}`), started: make(chan struct{}), release: make(chan struct{})}
		bodies = append(bodies, body)
		t.Cleanup(func() {
			if err := body.Close(); err != nil {
				t.Error(err)
			}
		})
		request := httptest.NewRequest(http.MethodPost, "/v1/catalog/runs", body)
		request.Header.Set("Content-Type", "application/json")
		go func() {
			handler.ServeHTTP(httptest.NewRecorder(), request)
			finished <- struct{}{}
		}()
		select {
		case <-body.started:
		case <-time.After(time.Second):
			t.Fatal("admitted body did not start reading")
		}
	}
	unread := &observedBody{}
	request := httptest.NewRequest(http.MethodPost, "/v1/catalog/runs", unread)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != 429 || unread.read.Load() {
		t.Fatal("excess processing read the body before rejecting capacity")
	}
	for _, body := range bodies {
		if err := body.Close(); err != nil {
			t.Fatal(err)
		}
	}
	for range 2 {
		select {
		case <-finished:
		case <-time.After(time.Second):
			t.Fatal("admitted request did not release")
		}
	}
}

func TestHandlerRejectsActualBodyLimitAndAmbiguousJSON(t *testing.T) {
	cfg, err := config.Load(func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, body string
		status     int
	}{
		{"untrusted absent content length", strings.Repeat(" ", (16<<10)+1), 413},
		{"duplicate normalized JSON key", `{"sample_id":"catalog-basic-v1","\u0073ample_id":"catalog-basic-v1"}`, 400},
		{"unknown field", `{"sample_id":"catalog-basic-v1","workspace_id":"arbitrary"}`, 400},
		{"wrong boolean type", `{"sample_id":"catalog-basic-v1","exclude_unavailable":"false"}`, 400},
		{"null prefix", `{"sample_id":"catalog-basic-v1","title_prefix":null}`, 400},
		{"trailing JSON", `{"sample_id":"catalog-basic-v1"}{}`, 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			handler := httpapi.New(nil, func(context.Context) error { return nil }, cfg)
			request := httptest.NewRequest(http.MethodPost, "/v1/catalog/runs", strings.NewReader(tc.body))
			request.ContentLength = -1
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != tc.status {
				t.Fatalf("got %d, want %d", response.Code, tc.status)
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("API error is cacheable")
			}
		})
	}
}
