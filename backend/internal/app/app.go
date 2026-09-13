package app

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"time"

	"example.com/catalog-workflow/backend/internal/catalog/pipeline"
	"example.com/catalog-workflow/backend/internal/config"
	"example.com/catalog-workflow/backend/internal/connector"
	"example.com/catalog-workflow/backend/internal/connector/source"
	"example.com/catalog-workflow/backend/internal/httpapi"
	"example.com/catalog-workflow/backend/internal/saas"
	"example.com/catalog-workflow/backend/internal/store/postgres"
)

type App struct {
	Handler http.Handler
	server  *http.Server
	store   *postgres.Store
}

func New(ctx context.Context, cfg config.Config, provider source.Source) (*App, error) {
	store, err := postgres.Open(ctx, cfg.DatabaseURL, cfg.AcquireTimeout)
	if err != nil {
		return nil, errors.New("database initialization failed")
	}
	ok := false
	defer func() {
		if !ok {
			store.Close()
		}
	}()
	startup, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := store.Ready(startup, cfg.WorkspaceID); err != nil {
		return nil, errors.New("database schema, role or workspace readiness failed")
	}
	if err := store.Recover(startup, cfg.WorkspaceID); err != nil {
		return nil, errors.New("interrupted run recovery failed")
	}
	workspace, err := saas.New(cfg.WorkspaceID)
	if err != nil {
		return nil, err
	}
	manager, err := connector.New(connector.Dependencies{Repository: store, Workspace: workspace, Source: provider}, connector.Config{
		MaxStoredRuns: cfg.MaxStoredRuns, CleanupTimeout: cfg.CleanupTimeout, Limits: pipeline.DefaultLimits(),
	})
	if err != nil {
		return nil, err
	}
	handler := httpapi.New(manager, func(ctx context.Context) error { return store.Ready(ctx, cfg.WorkspaceID) }, cfg)
	server := &http.Server{
		Addr: cfg.Address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second,
		WriteTimeout: 45 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10,
		BaseContext: func(net.Listener) context.Context { return ctx },
	}
	ok = true
	return &App{Handler: handler, server: server, store: store}, nil
}

func (a *App) Serve(ctx context.Context) error {
	done := make(chan error, 1)
	go func() { done <- a.server.ListenAndServe() }()
	select {
	case err := <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return errors.New("http server could not start")
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := a.server.Shutdown(shutdown); err != nil {
			if closeErr := a.server.Close(); closeErr != nil {
				slog.Warn("server connection close failed")
			}
			return errors.New("http shutdown deadline exceeded")
		}
		if err := <-done; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return errors.New("http shutdown failed")
		}
		return nil
	}
}

func (a *App) Close() { a.store.Close() }
