package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"example.com/catalog-workflow/backend/internal/config"
	"example.com/catalog-workflow/backend/migrations"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		slog.Error("application command failed", "category", err.Error())
		os.Exit(1)
	}
}

func run(args []string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	mode := "serve"
	if len(args) != 0 {
		mode = args[0]
	}
	switch mode {
	case "serve":
		if len(args) > 1 {
			return errors.New("serve accepts no additional arguments")
		}
		application, err := bootstrap(ctx, cfg)
		if err != nil {
			return err
		}
		defer application.Close()
		slog.Info("application ready", "mode", "demo")
		return application.Serve(ctx)
	case "migrate":
		if len(args) > 2 || (len(args) == 2 && args[1] != "up") {
			return errors.New("migrate supports only up")
		}
		operation, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if err := migrations.Up(operation, cfg.MigrationDatabaseURL); err != nil {
			return errors.New("migration failed; verify operator configuration and schema integrity")
		}
		slog.Info("migration complete")
		return nil
	case "reset":
		if len(args) != 2 || args[1] != "--confirm-demo-reset" {
			return errors.New("reset requires --confirm-demo-reset")
		}
		operation, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()
		if err := migrations.Reset(operation, cfg.MigrationDatabaseURL, cfg.DemoDatabaseName, cfg.WorkspaceID); err != nil {
			return errors.New("demo reset refused or failed; verify target and stop active processing")
		}
		slog.Info("demo run records removed; restore requires an existing operator backup")
		return nil
	case "health":
		return health(ctx, cfg.Address)
	default:
		return errors.New("supported commands are serve, migrate up, reset and health")
	}
}

func health(ctx context.Context, address string) error {
	_, port, err := net.SplitHostPort(address)
	if err != nil {
		return errors.New("invalid health address")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://127.0.0.1:"+port+"/readyz", nil)
	if err != nil {
		return errors.New("invalid health request")
	}
	client := &http.Client{Timeout: 4 * time.Second, Transport: &http.Transport{Proxy: nil}}
	response, err := client.Do(request)
	if err != nil {
		return errors.New("readiness request failed")
	}
	defer func() {
		if err := response.Body.Close(); err != nil {
			return
		}
	}()
	if response.StatusCode != http.StatusOK {
		return errors.New("application is not ready")
	}
	return nil
}
