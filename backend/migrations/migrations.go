package migrations

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

const Version = "202609130001"

//go:embed 202609130001_catalog.up.sql
var upSQL string

type Querier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func checksum() string {
	hash := sha256.Sum256([]byte(upSQL))
	return hex.EncodeToString(hash[:])
}

// Up applies the single reviewed migration in one transaction and verifies replay integrity.
func Up(ctx context.Context, databaseURL string) error {
	conn, err := connect(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer closeConnection(conn)
	var role string
	if err := conn.QueryRow(ctx, "SELECT current_user").Scan(&role); err != nil || role != "catalog_migrator" {
		return errors.New("migration requires the catalog_migrator role")
	}
	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration: %w", err)
	}
	defer rollback(ctx, tx)
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(812307412)"); err != nil {
		return fmt.Errorf("lock migration: %w", err)
	}
	const metadata = `CREATE SCHEMA IF NOT EXISTS catalog_meta;
REVOKE ALL ON SCHEMA catalog_meta FROM PUBLIC;
CREATE TABLE IF NOT EXISTS catalog_meta.schema_migrations (
version text PRIMARY KEY, checksum text NOT NULL CHECK (length(checksum) = 64),
applied_at timestamptz NOT NULL DEFAULT now());`
	if _, err := tx.Exec(ctx, metadata); err != nil {
		return fmt.Errorf("create migration metadata: %w", err)
	}
	var count int
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM catalog_meta.schema_migrations").Scan(&count); err != nil {
		return fmt.Errorf("read migration metadata: %w", err)
	}
	if count == 0 {
		if _, err := tx.Exec(ctx, upSQL); err != nil {
			return fmt.Errorf("apply migration: %w", err)
		}
		if _, err := tx.Exec(ctx, "INSERT INTO catalog_meta.schema_migrations (version, checksum) VALUES ($1,$2)", Version, checksum()); err != nil {
			return fmt.Errorf("record migration: %w", err)
		}
	}
	if err := Verify(ctx, tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration: %w", err)
	}
	return nil
}

func Verify(ctx context.Context, db Querier) error {
	rows, err := db.Query(ctx, "SELECT version, checksum FROM catalog_meta.schema_migrations ORDER BY version")
	if err != nil {
		return fmt.Errorf("read schema version: %w", err)
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var version, hash string
		if err := rows.Scan(&version, &hash); err != nil {
			return fmt.Errorf("scan schema version: %w", err)
		}
		if version != Version || hash != checksum() {
			return errors.New("schema version or checksum mismatch")
		}
		count++
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read schema version rows: %w", err)
	}
	if count != 1 {
		return errors.New("schema migration is incomplete")
	}
	return nil
}

// Reset removes only this demo workspace's runs; callers must require explicit operator confirmation.
func Reset(ctx context.Context, databaseURL, expectedDatabase, workspaceID string) error {
	if expectedDatabase == "" || workspaceID != "11111111-1111-4111-8111-111111111111" {
		return errors.New("reset requires an explicit demo database and workspace")
	}
	conn, err := connect(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer closeConnection(conn)
	var database, role string
	if err := conn.QueryRow(ctx, "SELECT current_database(), current_user").Scan(&database, &role); err != nil {
		return fmt.Errorf("verify reset target: %w", err)
	}
	if database != expectedDatabase || role != "catalog_migrator" {
		return errors.New("reset target or role does not match the configured demo")
	}
	if err := Verify(ctx, conn); err != nil {
		return err
	}
	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reset: %w", err)
	}
	defer rollback(ctx, tx)
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", workspaceID); err != nil {
		return fmt.Errorf("lock reset workspace: %w", err)
	}
	var active int
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM catalog_app.processing_runs WHERE workspace_id=$1::uuid AND status='processing'", workspaceID).Scan(&active); err != nil {
		return fmt.Errorf("check active runs: %w", err)
	}
	if active != 0 {
		return errors.New("reset refused while processing runs exist; stop and recover the application first")
	}
	if _, err := tx.Exec(ctx, "DELETE FROM catalog_app.result_items WHERE workspace_id=$1::uuid", workspaceID); err != nil {
		return fmt.Errorf("reset result rows: %w", err)
	}
	if _, err := tx.Exec(ctx, "DELETE FROM catalog_app.processing_runs WHERE workspace_id=$1::uuid", workspaceID); err != nil {
		return fmt.Errorf("reset run rows: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit demo reset: %w", err)
	}
	return nil
}

func connect(ctx context.Context, databaseURL string) (*pgx.Conn, error) {
	if databaseURL == "" {
		return nil, errors.New("migration database configuration is required")
	}
	cfg, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("migration database configuration is invalid")
	}
	cfg.ConnectTimeout = 2 * time.Second
	return pgx.ConnectConfig(ctx, cfg)
}

func closeConnection(conn *pgx.Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := conn.Close(ctx); err != nil {
		return // The owning operation already carries its outcome; no credential-bearing error is logged.
	}
}

func rollback(parent context.Context, tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(parent, 2*time.Second)
	defer cancel()
	if err := tx.Rollback(ctx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
		return // Rollback failure leaves the connection unusable; pgx closes it.
	}
}
