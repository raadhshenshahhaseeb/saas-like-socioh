package pipeline

import (
	"context"
	"io"

	"example.com/catalog-workflow/backend/internal/catalog/model"
	"example.com/catalog-workflow/backend/internal/catalog/parsing"
	"example.com/catalog-workflow/backend/internal/catalog/transformation"
	"example.com/catalog-workflow/backend/internal/catalog/validation"
)

type Limits struct {
	Bytes int64
	Rows  int
}

func DefaultLimits() Limits { return Limits{Bytes: 1 << 20, Rows: 1000} }

func Process(ctx context.Context, input io.Reader, rules model.Rules, limits Limits) (model.Result, error) {
	if err := validation.Rules(rules); err != nil {
		return model.Result{}, err
	}
	products, err := parsing.CSV(ctx, input, limits.Bytes, limits.Rows)
	if err != nil {
		return model.Result{}, err
	}
	products, err = validation.Products(ctx, products, rules)
	if err != nil {
		return model.Result{}, err
	}
	return transformation.Apply(ctx, products, rules)
}
