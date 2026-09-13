package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"example.com/catalog-workflow/backend/internal/catalog/model"
	"example.com/catalog-workflow/backend/internal/catalog/validation"
	"example.com/catalog-workflow/backend/internal/connector"
	"example.com/catalog-workflow/backend/migrations"
)

type Store struct {
	pool           *pgxpool.Pool
	acquireTimeout time.Duration
}

func Open(ctx context.Context, databaseURL string, acquireTimeout time.Duration) (*Store, error) {
	if databaseURL == "" {
		return nil, errors.New("database configuration is required")
	}
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("database configuration is invalid")
	}
	cfg.MaxConns = 5
	cfg.MinConns = 0
	cfg.MaxConnIdleTime = time.Minute
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.ConnConfig.ConnectTimeout = acquireTimeout
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "30000"
	cfg.ConnConfig.RuntimeParams["idle_in_transaction_session_timeout"] = "5000"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create database pool: %w", err)
	}
	return &Store{pool: pool, acquireTimeout: acquireTimeout}, nil
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) acquire(ctx context.Context) (*pgxpool.Conn, error) {
	acquireCtx, cancel := context.WithTimeout(ctx, s.acquireTimeout)
	defer cancel()
	conn, err := s.pool.Acquire(acquireCtx)
	if err != nil {
		return nil, fmt.Errorf("acquire database connection: %w", err)
	}
	return conn, nil
}

func (s *Store) Ready(ctx context.Context, workspaceID string) error {
	conn, err := s.acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if err := conn.Ping(ctx); err != nil {
		return fmt.Errorf("database readiness: %w", err)
	}
	if err := migrations.Verify(ctx, conn); err != nil {
		return err
	}
	var slug, role string
	if err := conn.QueryRow(ctx, "SELECT slug, current_user FROM catalog_app.workspaces WHERE id=$1::uuid", workspaceID).Scan(&slug, &role); err != nil {
		return fmt.Errorf("verify workspace seed: %w", err)
	}
	if slug != "demo" || role != "catalog_runtime" {
		return errors.New("invalid workspace seed or runtime database role")
	}
	return nil
}

func (s *Store) Recover(ctx context.Context, workspaceID string) error {
	conn, err := s.acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	_, err = conn.Exec(ctx, `UPDATE catalog_app.processing_runs SET status='failed', finished_at=now(),
failure_code='interrupted', failure_message='The application stopped before this run completed.',
failure_details='[]'::jsonb WHERE workspace_id=$1::uuid AND status='processing'`, workspaceID)
	if err != nil {
		return fmt.Errorf("recover interrupted runs: %w", err)
	}
	return nil
}

func (s *Store) Create(ctx context.Context, run model.Run, maxStored int) error {
	conn, err := s.acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin run admission: %w", err)
	}
	defer rollback(ctx, tx)
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", run.WorkspaceID); err != nil {
		return fmt.Errorf("lock workspace capacity: %w", err)
	}
	var count int
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM catalog_app.processing_runs WHERE workspace_id=$1::uuid", run.WorkspaceID).Scan(&count); err != nil {
		return fmt.Errorf("count stored runs: %w", err)
	}
	if count >= maxStored {
		return connector.ErrCapacity
	}
	_, err = tx.Exec(ctx, `INSERT INTO catalog_app.processing_runs
(id,workspace_id,source_kind,sample_id,title_prefix,exclude_unavailable,status,started_at)
VALUES ($1::uuid,$2::uuid,$3,NULLIF($4,''),$5,$6,'processing',$7)`,
		run.ID, run.WorkspaceID, run.Source.Kind, run.Source.SampleID, run.Rules.TitlePrefix,
		run.Rules.ExcludeUnavailable, run.StartedAt)
	if err != nil {
		return fmt.Errorf("insert processing run: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit run admission: %w", err)
	}
	return nil
}

func (s *Store) Complete(ctx context.Context, workspaceID, runID string, result model.Result) error {
	conn, err := s.acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin completion: %w", err)
	}
	defer rollback(ctx, tx)
	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM catalog_app.processing_runs
WHERE workspace_id=$1::uuid AND id=$2::uuid FOR UPDATE`, workspaceID, runID).Scan(&status); err != nil {
		return fmt.Errorf("lock processing run: %w", err)
	}
	if status != "processing" {
		return errors.New("run is already terminal")
	}
	batch := &pgx.Batch{}
	for _, item := range result.Items {
		if _, valid := validation.Decimal(item.Input.Price); !valid {
			return errors.New("invalid exact price before persistence")
		}
		batch.Queue(`INSERT INTO catalog_app.result_items
(workspace_id,run_id,original_position,sku,input_title,price,currency,availability,output_title,included,exclusion_reason)
VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::text::numeric,$7,$8,$9,$10,NULLIF($11,''))`,
			workspaceID, runID, item.Position, item.Input.SKU, item.Input.Title, item.Input.Price,
			item.Input.Currency, item.Input.Availability, item.OutputTitle, item.Included, item.ExclusionReason)
	}
	results := tx.SendBatch(ctx, batch)
	if err := results.Close(); err != nil {
		return fmt.Errorf("insert result items: %w", err)
	}
	command, err := tx.Exec(ctx, `UPDATE catalog_app.processing_runs SET status='completed',
input_count=$3,included_count=$4,excluded_count=$5,finished_at=now()
WHERE workspace_id=$1::uuid AND id=$2::uuid AND status='processing'`,
		workspaceID, runID, result.Counts.Input, result.Counts.Included, result.Counts.Excluded)
	if err != nil {
		return fmt.Errorf("complete run: %w", err)
	}
	if command.RowsAffected() != 1 {
		return errors.New("completion transition was not applied")
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit completed result: %w", err)
	}
	return nil
}

func (s *Store) Fail(ctx context.Context, workspaceID, runID string, fault *model.Fault) error {
	conn, err := s.acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	details, err := json.Marshal(fault.Details)
	if err != nil {
		return fmt.Errorf("encode safe failure details: %w", err)
	}
	_, err = conn.Exec(ctx, `UPDATE catalog_app.processing_runs SET status='failed',finished_at=now(),
failure_code=$3,failure_message=$4,failure_details=$5::jsonb,failure_details_truncated=$6
WHERE workspace_id=$1::uuid AND id=$2::uuid AND status='processing'`,
		workspaceID, runID, fault.Code, fault.Message, details, fault.DetailsTruncated)
	if err != nil {
		return fmt.Errorf("record failed run: %w", err)
	}
	return nil
}

func (s *Store) Get(ctx context.Context, workspaceID, runID string) (model.Run, error) {
	conn, err := s.acquire(ctx)
	if err != nil {
		return model.Run{}, err
	}
	defer conn.Release()
	tx, err := conn.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return model.Run{}, fmt.Errorf("begin result read: %w", err)
	}
	defer rollback(ctx, tx)
	run := model.Run{WorkspaceID: workspaceID}
	var input, included, excluded *int
	var code, message *string
	var details []byte
	var truncated bool
	err = tx.QueryRow(ctx, `SELECT id::text,status,source_kind,COALESCE(sample_id,''),title_prefix,
exclude_unavailable,input_count,included_count,excluded_count,started_at,finished_at,
failure_code,failure_message,COALESCE(failure_details,'[]'::jsonb),failure_details_truncated
FROM catalog_app.processing_runs WHERE workspace_id=$1::uuid AND id=$2::uuid`, workspaceID, runID).Scan(
		&run.ID, &run.Status, &run.Source.Kind, &run.Source.SampleID, &run.Rules.TitlePrefix,
		&run.Rules.ExcludeUnavailable, &input, &included, &excluded, &run.StartedAt, &run.FinishedAt,
		&code, &message, &details, &truncated)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Run{}, connector.ErrNotFound
	}
	if err != nil {
		return model.Run{}, fmt.Errorf("read processing run: %w", err)
	}
	// pgx may scan timestamptz using the process timezone; the API always emits UTC.
	run.StartedAt = run.StartedAt.UTC()
	if run.FinishedAt != nil {
		finished := run.FinishedAt.UTC()
		run.FinishedAt = &finished
	}
	if run.Status == "failed" {
		if code == nil || message == nil {
			return model.Run{}, errors.New("incomplete failure record")
		}
		run.Failure = model.NewFault(*code, *message)
		run.Failure.DetailsTruncated = truncated
		if err := json.Unmarshal(details, &run.Failure.Details); err != nil {
			return model.Run{}, fmt.Errorf("decode safe failure details: %w", err)
		}
	}
	if run.Status == "completed" {
		if input == nil || included == nil || excluded == nil {
			return model.Run{}, errors.New("incomplete result counts")
		}
		run.Counts = &model.Counts{Input: *input, Included: *included, Excluded: *excluded}
		preview, err := readPreview(ctx, tx, workspaceID, runID)
		if err != nil {
			return model.Run{}, err
		}
		if len(preview.Rows) != *included {
			return model.Run{}, errors.New("stored result count mismatch")
		}
		run.Preview = &preview
		run.ExportAvailable = true
	}
	if err := tx.Commit(ctx); err != nil {
		return model.Run{}, fmt.Errorf("finish result read: %w", err)
	}
	return run, nil
}

func readPreview(ctx context.Context, tx pgx.Tx, workspaceID, runID string) (model.Preview, error) {
	preview := model.Preview{Columns: append([]string{}, model.Columns...), Rows: []model.Product{}}
	rows, err := tx.Query(ctx, `SELECT sku,output_title,price::text,currency,availability
FROM catalog_app.result_items WHERE workspace_id=$1::uuid AND run_id=$2::uuid AND included
ORDER BY original_position LIMIT 1001`, workspaceID, runID)
	if err != nil {
		return preview, fmt.Errorf("read completed items: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var product model.Product
		if err := rows.Scan(&product.SKU, &product.Title, &product.Price, &product.Currency, &product.Availability); err != nil {
			return preview, fmt.Errorf("scan completed item: %w", err)
		}
		price, valid := validation.Decimal(product.Price)
		if !valid || len(preview.Rows) == 1000 {
			return preview, errors.New("stored result exceeds the product contract")
		}
		product.Price = price
		preview.Rows = append(preview.Rows, product)
	}
	if err := rows.Err(); err != nil {
		return preview, fmt.Errorf("read completed item rows: %w", err)
	}
	return preview, nil
}

func rollback(parent context.Context, tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(parent, 2*time.Second)
	defer cancel()
	if err := tx.Rollback(ctx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
		return // pgx invalidates a connection when transaction cleanup fails.
	}
}
