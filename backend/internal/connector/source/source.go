package source

import (
	"context"
	"io"
)

type Descriptor struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

// Source returns raw input, so all providers cross the same parser/validation boundary.
type Source interface {
	List(context.Context) ([]Descriptor, error)
	Open(context.Context, string) (io.ReadCloser, error)
}
