package model

import "net/http"

type Issue struct {
	Code    string `json:"code"`
	Row     int    `json:"row,omitempty"`
	Line    int    `json:"line,omitempty"`
	Field   string `json:"field,omitempty"`
	Message string `json:"message"`
}

// Fault contains only allowlisted public explanations, never dependency errors or input excerpts.
type Fault struct {
	Code             string  `json:"code"`
	Message          string  `json:"message"`
	RunID            string  `json:"run_id,omitempty"`
	Details          []Issue `json:"details"`
	DetailsTruncated bool    `json:"details_truncated"`
}

func (f *Fault) Error() string { return f.Code }

func NewFault(code, message string) *Fault {
	return &Fault{Code: code, Message: message, Details: []Issue{}}
}

func (f *Fault) HTTPStatus() int {
	switch f.Code {
	case "invalid_request":
		return http.StatusBadRequest
	case "input_limit":
		return http.StatusRequestEntityTooLarge
	case "unsupported_media_type":
		return http.StatusUnsupportedMediaType
	case "validation_error":
		return http.StatusUnprocessableEntity
	case "capacity_exceeded", "storage_capacity_exceeded":
		return http.StatusTooManyRequests
	case "source_unavailable", "database_unavailable":
		return http.StatusServiceUnavailable
	case "deadline_exceeded", "cancelled":
		return http.StatusGatewayTimeout
	case "run_not_found":
		return http.StatusNotFound
	case "export_not_completed":
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}
