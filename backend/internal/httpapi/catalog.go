package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"example.com/catalog-workflow/backend/internal/catalog/export"
	"example.com/catalog-workflow/backend/internal/catalog/model"
	"example.com/catalog-workflow/backend/internal/config"
	"example.com/catalog-workflow/backend/internal/connector"
)

const (
	fileLimit        = 1 << 20
	envelopeOverhead = 16 << 10
	responseLimit    = 4 << 20
)

type Handler struct {
	manager *connector.Manager
	ready   func(context.Context) error
	cfg     config.Config
	posts   chan struct{}
	reads   chan struct{}
}

func New(manager *connector.Manager, ready func(context.Context) error, cfg config.Config) *Handler {
	return &Handler{manager: manager, ready: ready, cfg: cfg,
		posts: make(chan struct{}, cfg.PostSlots), reads: make(chan struct{}, cfg.ReadSlots)}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	defer func() {
		if recover() != nil {
			writeFault(w, model.NewFault("internal_error", "The request could not be completed."))
		}
	}()
	if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		if r.URL.Path == "/readyz" {
			ctx, cancel := context.WithTimeout(r.Context(), h.cfg.ReadTimeout)
			defer cancel()
			if err := h.ready(ctx); err != nil {
				writeFault(w, model.NewFault("database_unavailable", "The application is not ready."))
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	if r.URL.Path == "/v1/catalog/runs" && r.Method == http.MethodPost {
		h.withLimit(w, r, h.posts, h.cfg.PostTimeout, h.process)
		return
	}
	if r.URL.Path == "/v1/catalog/runs" {
		w.Header().Set("Allow", "POST")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]*model.Fault{"error": model.NewFault("method_not_allowed", "This request method is not supported.")})
		return
	}
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	h.withLimit(w, r, h.reads, h.cfg.ReadTimeout, h.read)
}

func (h *Handler) withLimit(w http.ResponseWriter, r *http.Request, slots chan struct{}, timeout time.Duration, next http.HandlerFunc) {
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()
	select {
	case slots <- struct{}{}:
		defer func() { <-slots }()
	default:
		writeFault(w, model.NewFault("capacity_exceeded", "The application is busy. Make a deliberate later attempt."))
		return
	}
	if r.Method == http.MethodGet {
		if err := http.NewResponseController(w).SetWriteDeadline(time.Now().Add(timeout)); err != nil && !errors.Is(err, http.ErrNotSupported) {
			writeFault(w, model.NewFault("internal_error", "A response deadline could not be established."))
			return
		}
	}
	next(w, r.WithContext(ctx))
}

func (h *Handler) process(w http.ResponseWriter, r *http.Request) {
	media, parameters, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil {
		writeFault(w, model.NewFault("unsupported_media_type", "Use JSON for a sample or multipart form data for an upload."))
		return
	}
	limit := int64(envelopeOverhead)
	if media == "multipart/form-data" {
		limit += fileLimit
	} else if media != "application/json" {
		writeFault(w, model.NewFault("unsupported_media_type", "Use JSON for a sample or multipart form data for an upload."))
		return
	}
	data, err := h.body(w, r, limit)
	if err != nil {
		writeFault(w, connector.PublicError(r.Context(), err, "invalid_request"))
		return
	}
	var request connector.Request
	if media == "application/json" {
		request, err = decodeJSON(data)
	} else {
		request, err = decodeMultipart(data, parameters["boundary"])
	}
	if err != nil {
		writeFault(w, connector.PublicError(r.Context(), err, "invalid_request"))
		return
	}
	if request.Source.Kind == "sample" {
		samples, err := h.manager.Samples(r.Context())
		if err != nil {
			writeFault(w, connector.PublicError(r.Context(), err, "source_unavailable"))
			return
		}
		found := false
		for _, sample := range samples {
			found = found || sample.ID == request.Source.SampleID
		}
		if !found {
			writeFault(w, invalidEnvelope())
			return
		}
	}
	run, err := h.manager.Process(r.Context(), request)
	if err != nil {
		writeFault(w, connector.PublicError(r.Context(), err, "internal_error"))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]model.Run{"run": run})
}

func (h *Handler) body(w http.ResponseWriter, r *http.Request, limit int64) ([]byte, error) {
	if r.ContentLength > limit {
		return nil, model.NewFault("input_limit", "The request exceeds the input size limit.")
	}
	controller := http.NewResponseController(w)
	if err := controller.SetReadDeadline(time.Now().Add(h.cfg.BodyTimeout)); err != nil && !errors.Is(err, http.ErrNotSupported) {
		return nil, model.NewFault("internal_error", "A request deadline could not be established.")
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	stop := context.AfterFunc(r.Context(), func() {
		if err := r.Body.Close(); err != nil {
			return
		}
	})
	defer stop()
	data, err := io.ReadAll(r.Body)
	if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
		return nil, model.NewFault("input_limit", "The request exceeds the input size limit.")
	}
	var timeout net.Error
	if errors.As(err, &timeout) && timeout.Timeout() {
		return nil, model.NewFault("deadline_exceeded", "The request body exceeded its read deadline.")
	}
	if err != nil {
		return nil, err
	}
	if err := r.Context().Err(); err != nil {
		return nil, err
	}
	return data, nil
}

func (h *Handler) read(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/v1/catalog/samples" {
		samples, err := h.manager.Samples(r.Context())
		if err != nil {
			writeFault(w, connector.PublicError(r.Context(), err, "source_unavailable"))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"samples": samples})
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	validLength := len(parts) == 5 || (len(parts) == 6 && parts[5] == "export")
	if !validLength || parts[1] != "v1" || parts[2] != "catalog" || parts[3] != "runs" {
		writeFault(w, model.NewFault("run_not_found", "The requested result was not found."))
		return
	}
	run, err := h.manager.Get(r.Context(), parts[4])
	if err != nil {
		writeFault(w, connector.PublicError(r.Context(), err, "database_unavailable"))
		return
	}
	if len(parts) == 5 {
		writeJSON(w, http.StatusOK, map[string]model.Run{"run": run})
		return
	}
	if !run.ExportAvailable || run.Preview == nil {
		writeFault(w, model.NewFault("export_not_completed", "Only a completed result can be downloaded."))
		return
	}
	data, err := export.CSV(r.Context(), *run.Preview)
	if err != nil {
		writeFault(w, connector.PublicError(r.Context(), err, "internal_error"))
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="catalog-output.csv"`)
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(data); err != nil {
		return // A lost response cannot change the persisted completed result.
	}
}

func decodeJSON(data []byte) (connector.Request, error) {
	request := connector.Request{Source: model.Source{Kind: "sample"}}
	if !utf8.Valid(data) {
		return request, invalidEnvelope()
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	start, err := decoder.Token()
	if err != nil || start != json.Delim('{') {
		return request, invalidEnvelope()
	}
	seen := map[string]bool{}
	for decoder.More() {
		token, err := decoder.Token()
		key, ok := token.(string)
		if err != nil || !ok || seen[key] {
			return request, invalidEnvelope()
		}
		seen[key] = true
		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return request, invalidEnvelope()
		}
		switch key {
		case "sample_id":
			err = json.Unmarshal(raw, &request.Source.SampleID)
		case "title_prefix":
			err = json.Unmarshal(raw, &request.Rules.TitlePrefix)
		case "exclude_unavailable":
			err = json.Unmarshal(raw, &request.Rules.ExcludeUnavailable)
		default:
			return request, invalidEnvelope()
		}
		if err != nil {
			return request, invalidEnvelope()
		}
	}
	if _, err := decoder.Token(); err != nil || request.Source.SampleID == "" {
		return request, invalidEnvelope()
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return request, invalidEnvelope()
	}
	return request, nil
}

func decodeMultipart(data []byte, boundary string) (connector.Request, error) {
	request := connector.Request{Source: model.Source{Kind: "upload"}}
	if boundary == "" || len(boundary) > 70 {
		return request, invalidEnvelope()
	}
	reader := multipart.NewReader(bytes.NewReader(data), boundary)
	seen := map[string]bool{}
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return request, invalidEnvelope()
		}
		name := part.FormName()
		known := name == "file" || name == "title_prefix" || name == "exclude_unavailable"
		if !known || seen[name] {
			return request, invalidEnvelope()
		}
		seen[name] = true
		limit := int64(envelopeOverhead)
		if name == "file" {
			limit = fileLimit
			if part.FileName() == "" {
				return request, invalidEnvelope()
			}
		} else if part.FileName() != "" {
			return request, invalidEnvelope()
		}
		value, err := io.ReadAll(io.LimitReader(part, limit+1))
		if err != nil {
			return request, invalidEnvelope()
		}
		if int64(len(value)) > limit {
			return request, model.NewFault("input_limit", "The uploaded file or form field exceeds its size limit.")
		}
		if err := part.Close(); err != nil {
			return request, invalidEnvelope()
		}
		switch name {
		case "file":
			request.Upload = value
		case "title_prefix":
			request.Rules.TitlePrefix = string(value)
		case "exclude_unavailable":
			if string(value) != "true" && string(value) != "false" {
				return request, invalidEnvelope()
			}
			request.Rules.ExcludeUnavailable = string(value) == "true"
		}
	}
	if !seen["file"] {
		return request, invalidEnvelope()
	}
	return request, nil
}

func invalidEnvelope() *model.Fault {
	return model.NewFault("invalid_request", "Use one supported sample or file and the documented rule fields.")
}

func methodNotAllowed(w http.ResponseWriter) {
	w.Header().Set("Allow", "GET, POST")
	writeJSON(w, http.StatusMethodNotAllowed, map[string]*model.Fault{"error": model.NewFault("method_not_allowed", "This request method is not supported.")})
}

func writeFault(w http.ResponseWriter, fault *model.Fault) {
	writeJSON(w, fault.HTTPStatus(), map[string]*model.Fault{"error": fault})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	data, err := json.Marshal(body)
	if err != nil || len(data) > responseLimit {
		status = http.StatusInternalServerError
		data = []byte(`{"error":{"code":"internal_error","message":"The response could not be produced.","details":[],"details_truncated":false}}`)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if _, err := w.Write(data); err != nil {
		return
	}
}
