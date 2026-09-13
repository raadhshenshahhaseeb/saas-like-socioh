package main

import (
	"context"

	"example.com/catalog-workflow/backend/internal/app"
	"example.com/catalog-workflow/backend/internal/config"
	"example.com/catalog-workflow/backend/internal/connector/source/mock"
)

func bootstrap(ctx context.Context, cfg config.Config) (*app.App, error) {
	return app.New(ctx, cfg, mock.BuiltIn())
}
