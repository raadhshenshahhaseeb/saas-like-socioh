//go:build integration

package postgres_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"example.com/catalog-workflow/backend/internal/catalog/model"
	"example.com/catalog-workflow/backend/internal/config"
	"example.com/catalog-workflow/backend/internal/connector"
	"example.com/catalog-workflow/backend/internal/store/postgres"
	"example.com/catalog-workflow/backend/internal/testsupport"
	"example.com/catalog-workflow/backend/migrations"
)

func TestRunsIntegration(t *testing.T) {
	runtimeURL, migrationURL := testsupport.DatabaseURLs(t)
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	if err := migrations.Up(ctx, migrationURL); err != nil {
		t.Fatal("test migration failed:", err)
	}
	if err := migrations.Up(ctx, migrationURL); err != nil {
		t.Fatal("migration replay failed:", err)
	}
	if err := migrations.Reset(ctx, migrationURL, "catalog_integration", config.DemoWorkspaceID); err != nil {
		t.Fatal("test reset failed:", err)
	}
	store, err := postgres.Open(ctx, runtimeURL, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Ready(ctx, config.DemoWorkspaceID); err != nil {
		t.Fatal("readiness failed:", err)
	}
	run := model.Run{ID: model.NewID(), WorkspaceID: config.DemoWorkspaceID, Status: "processing",
		Source: model.Source{Kind: "upload"}, Rules: model.Rules{TitlePrefix: "Demo: "}, StartedAt: time.Now().UTC()}
	if err := store.Create(ctx, run, 100); err != nil {
		t.Fatal(err)
	}
	result := model.Result{Counts: model.Counts{Input: 1, Included: 1}, Items: []model.Item{{
		Position: 1, Input: model.Product{SKU: "ITEM-1", Title: "Sample", Price: "99999999999999.9999", Currency: "USD", Availability: "in_stock"},
		OutputTitle: "Demo: Sample", Included: true,
	}}}
	if err := store.Complete(ctx, run.WorkspaceID, run.ID, result); err != nil {
		t.Fatal(err)
	}
	if err := store.Fail(ctx, run.WorkspaceID, run.ID, model.NewFault("cancelled", "The request was cancelled.")); err != nil {
		t.Fatal(err)
	}
	retrieved, err := store.Get(ctx, run.WorkspaceID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if retrieved.Status != "completed" || retrieved.Preview == nil || len(retrieved.Preview.Rows) != 1 {
		t.Fatalf("completion was not retained: %+v", retrieved)
	}
	if retrieved.Preview.Rows[0].Price != "99999999999999.9999" || retrieved.Rules.TitlePrefix != "Demo: " {
		t.Fatal("exact result/settings did not survive storage")
	}
	store.Close()
	restarted, err := postgres.Open(ctx, runtimeURL, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	afterRestart, err := restarted.Get(ctx, run.WorkspaceID, run.ID)
	if err != nil || afterRestart.Status != "completed" {
		t.Fatal("known completed result did not survive pool restart")
	}
}

func TestRunTimestampsUTC(t *testing.T) {
	if os.Getenv("CATALOG_TIMESTAMP_TEST_CHILD") != "1" {
		command := exec.CommandContext(t.Context(), os.Args[0], "-test.run=^TestRunTimestampsUTC$", "-test.v")
		command.Env = append(os.Environ(), "TZ=Etc/GMT-5", "CATALOG_TIMESTAMP_TEST_CHILD=1")
		output, err := command.CombinedOutput()
		if err != nil {
			t.Fatalf("non-UTC subprocess regression failed: %v\n%s", err, output)
		}
		return
	}
	_, offset := time.Now().Zone()
	if offset != 5*60*60 {
		t.Fatal("timestamp regression requires its isolated non-UTC process timezone")
	}
	runtimeURL, migrationURL := testsupport.DatabaseURLs(t)
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	if err := migrations.Up(ctx, migrationURL); err != nil {
		t.Fatal(err)
	}
	store, err := postgres.Open(ctx, runtimeURL, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	run := model.Run{ID: model.NewID(), WorkspaceID: config.DemoWorkspaceID,
		Source: model.Source{Kind: "upload"}, StartedAt: time.Now().UTC()}
	if err := store.Create(ctx, run, 100); err != nil {
		t.Fatal(err)
	}
	item := model.Item{Position: 1, Input: model.Product{SKU: "UTC-1", Title: "Sample", Price: "1", Currency: "USD", Availability: "in_stock"}, OutputTitle: "Sample", Included: true}
	if err := store.Complete(ctx, run.WorkspaceID, run.ID, model.Result{Counts: model.Counts{Input: 1, Included: 1}, Items: []model.Item{item}}); err != nil {
		t.Fatal(err)
	}
	retrieved, err := store.Get(ctx, run.WorkspaceID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(retrieved)
	if err != nil {
		t.Fatal(err)
	}
	var response struct {
		Started  string `json:"started_at"`
		Finished string `json:"finished_at"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(response.Started, "Z") || !strings.HasSuffix(response.Finished, "Z") {
		t.Fatalf("timestamps must use UTC Z serialization after PostgreSQL scan; got %s and %s", response.Started, response.Finished)
	}
}

func TestRunsCapacityRollbackAndRoleIntegrity(t *testing.T) {
	runtimeURL, migrationURL := testsupport.DatabaseURLs(t)
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	if err := migrations.Up(ctx, migrationURL); err != nil {
		t.Fatal(err)
	}
	store, err := postgres.Open(ctx, runtimeURL, 2*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Recover(ctx, config.DemoWorkspaceID); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Reset(ctx, migrationURL, "catalog_integration", config.DemoWorkspaceID); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		if err := store.Recover(cleanup, config.DemoWorkspaceID); err != nil {
			t.Error(err)
		}
	}()
	var admitted atomic.Int32
	var rejected atomic.Int32
	var pending sync.WaitGroup
	errorsCh := make(chan error, 12)
	for range 12 {
		pending.Add(1)
		go func() {
			defer pending.Done()
			run := model.Run{ID: model.NewID(), WorkspaceID: config.DemoWorkspaceID, Source: model.Source{Kind: "upload"}, StartedAt: time.Now().UTC()}
			err := store.Create(ctx, run, 3)
			switch {
			case err == nil:
				admitted.Add(1)
			case errors.Is(err, connector.ErrCapacity):
				rejected.Add(1)
			default:
				errorsCh <- err
			}
		}()
	}
	pending.Wait()
	close(errorsCh)
	for err := range errorsCh {
		t.Error(err)
	}
	if admitted.Load() != 3 || rejected.Load() != 9 {
		t.Fatal("concurrent admissions exceeded the persisted run cap")
	}
	if err := migrations.Reset(ctx, migrationURL, "catalog_integration", config.DemoWorkspaceID); err == nil {
		t.Fatal("reset erased active processing runs")
	}
	if err := store.Recover(ctx, config.DemoWorkspaceID); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Reset(ctx, migrationURL, "catalog_integration", config.DemoWorkspaceID); err != nil {
		t.Fatal(err)
	}
	run := model.Run{ID: model.NewID(), WorkspaceID: config.DemoWorkspaceID, Source: model.Source{Kind: "upload"}, StartedAt: time.Now().UTC()}
	if err := store.Create(ctx, run, 100); err != nil {
		t.Fatal(err)
	}
	item := model.Item{Position: 1, Input: model.Product{SKU: "ITEM-1", Title: "Sample", Price: "1", Currency: "USD", Availability: "in_stock"}, OutputTitle: "Sample", Included: true}
	duplicate := item
	duplicate.Position = 2
	bad := model.Result{Counts: model.Counts{Input: 2, Included: 2}, Items: []model.Item{item, duplicate}}
	if err := store.Complete(ctx, run.WorkspaceID, run.ID, bad); err == nil {
		t.Fatal("duplicate items did not roll back completion")
	}
	operator, err := pgx.Connect(ctx, migrationURL)
	if err != nil {
		t.Fatal("operator test connection failed")
	}
	defer func() {
		if err := operator.Close(ctx); err != nil {
			t.Error(err)
		}
	}()
	var count int
	if err := operator.QueryRow(ctx, "SELECT count(*) FROM catalog_app.result_items WHERE run_id=$1::uuid", run.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("partial result rows survived a failed completion")
	}
	retrieved, err := store.Get(ctx, run.WorkspaceID, run.ID)
	if err != nil || retrieved.Status != "processing" {
		t.Fatal("failed transaction changed the run state")
	}
	runtimeConn, err := pgx.Connect(ctx, runtimeURL)
	if err != nil {
		t.Fatal("runtime test connection failed")
	}
	defer func() {
		if err := runtimeConn.Close(ctx); err != nil {
			t.Error(err)
		}
	}()
	if _, err := runtimeConn.Exec(ctx, "UPDATE catalog_app.result_items SET sku=sku WHERE false"); err == nil {
		t.Fatal("runtime role can mutate completed result data")
	}
	if err := migrations.Up(ctx, runtimeURL); err == nil {
		t.Fatal("runtime role can run migrations")
	}
	if err := migrations.Reset(ctx, migrationURL, "wrong_database", config.DemoWorkspaceID); err == nil {
		t.Fatal("reset ignored the exact database guard")
	}
	tx, err := operator.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "UPDATE catalog_meta.schema_migrations SET checksum=repeat('0',64)"); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Verify(ctx, tx); err == nil {
		t.Fatal("changed migration checksum was accepted")
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
}
