//go:build testfixture

// Command testserver is an explicit acceptance-test composition; production images exclude it.
package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"example.com/catalog-workflow/backend/internal/app"
	"example.com/catalog-workflow/backend/internal/config"
	"example.com/catalog-workflow/backend/internal/connector/source/mock"
)

func main() {
	if err := run(); err != nil {
		slog.Error("test composition failed", "category", err.Error())
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	base := mock.BuiltIn()
	fault := mock.New(mock.WithList(base.List), mock.WithOpen(func(context.Context, string) (io.ReadCloser, error) {
		return nil, errors.New("injected source failure")
	}))
	application, err := app.New(ctx, cfg, fault)
	if err != nil {
		return err
	}
	defer application.Close()
	return application.Serve(ctx)
}
