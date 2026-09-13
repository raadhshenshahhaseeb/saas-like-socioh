package mock

import (
	"bytes"
	"context"
	_ "embed"
	"errors"
	"io"

	"example.com/catalog-workflow/backend/internal/connector/source"
)

const SampleID = "catalog-basic-v1"

//go:embed testdata/catalog-basic.csv
var sample []byte

var ErrUnexpectedCall = errors.New("unconfigured source call")

type Source struct {
	list func(context.Context) ([]source.Descriptor, error)
	open func(context.Context, string) (io.ReadCloser, error)
}

type Option func(*Source)

func WithList(fn func(context.Context) ([]source.Descriptor, error)) Option {
	return func(s *Source) { s.list = fn }
}

func WithOpen(fn func(context.Context, string) (io.ReadCloser, error)) Option {
	return func(s *Source) { s.open = fn }
}

func New(options ...Option) *Source {
	s := &Source{}
	for _, option := range options {
		option(s)
	}
	return s
}

func (s *Source) List(ctx context.Context) ([]source.Descriptor, error) {
	if s.list == nil {
		return nil, ErrUnexpectedCall
	}
	return s.list(ctx)
}

func (s *Source) Open(ctx context.Context, id string) (io.ReadCloser, error) {
	if s.open == nil {
		return nil, ErrUnexpectedCall
	}
	return s.open(ctx, id)
}

func BuiltIn() *Source {
	return New(
		WithList(func(ctx context.Context) ([]source.Descriptor, error) {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			return []source.Descriptor{{ID: SampleID, Label: "Basic catalog", Description: "Synthetic products with available and unavailable items."}}, nil
		}),
		WithOpen(func(ctx context.Context, id string) (io.ReadCloser, error) {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			if id != SampleID {
				return nil, ErrUnexpectedCall
			}
			return io.NopCloser(bytes.NewReader(sample)), nil
		}),
	)
}
