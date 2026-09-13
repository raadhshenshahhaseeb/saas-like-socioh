CREATE SCHEMA catalog_app;
REVOKE ALL ON SCHEMA catalog_app FROM PUBLIC;

CREATE TABLE catalog_app.workspaces (
    id uuid PRIMARY KEY,
    slug text UNIQUE NOT NULL CHECK (slug = 'demo'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_app.processing_runs (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES catalog_app.workspaces(id),
    source_kind text NOT NULL CHECK (source_kind IN ('sample', 'upload')),
    sample_id text,
    title_prefix text NOT NULL CHECK (char_length(title_prefix) <= 64),
    exclude_unavailable boolean NOT NULL,
    status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
    input_count integer,
    included_count integer,
    excluded_count integer,
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    failure_code text,
    failure_message text CHECK (char_length(failure_message) <= 256),
    failure_details jsonb CHECK (jsonb_typeof(failure_details) = 'array' AND jsonb_array_length(failure_details) <= 100),
    failure_details_truncated boolean NOT NULL DEFAULT false,
    UNIQUE (workspace_id, id),
    CHECK ((source_kind = 'sample' AND sample_id = 'catalog-basic-v1' AND sample_id IS NOT NULL)
        OR (source_kind = 'upload' AND sample_id IS NULL)),
    CHECK (
        (status = 'processing' AND finished_at IS NULL AND input_count IS NULL AND included_count IS NULL
            AND excluded_count IS NULL AND failure_code IS NULL AND failure_message IS NULL
            AND failure_details IS NULL AND NOT failure_details_truncated)
        OR (status = 'completed' AND finished_at IS NOT NULL AND input_count BETWEEN 1 AND 1000
            AND input_count IS NOT NULL AND included_count IS NOT NULL AND excluded_count IS NOT NULL
            AND included_count >= 0 AND excluded_count >= 0 AND input_count = included_count + excluded_count
            AND failure_code IS NULL AND failure_message IS NULL AND failure_details IS NULL AND NOT failure_details_truncated)
        OR (status = 'failed' AND finished_at IS NOT NULL AND input_count IS NULL AND included_count IS NULL
            AND excluded_count IS NULL AND failure_code IS NOT NULL AND failure_message IS NOT NULL
            AND failure_details IS NOT NULL)
    )
);

CREATE TABLE catalog_app.result_items (
    workspace_id uuid NOT NULL,
    run_id uuid NOT NULL,
    original_position integer NOT NULL CHECK (original_position BETWEEN 1 AND 1000),
    sku text NOT NULL CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
    input_title text NOT NULL CHECK (char_length(input_title) BETWEEN 1 AND 200),
    price numeric(18,4) NOT NULL CHECK (price >= 0 AND price < 100000000000000),
    currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    availability text NOT NULL CHECK (availability IN ('in_stock', 'out_of_stock')),
    output_title text NOT NULL CHECK (char_length(output_title) BETWEEN 1 AND 264),
    included boolean NOT NULL,
    exclusion_reason text,
    PRIMARY KEY (workspace_id, run_id, original_position),
    UNIQUE (workspace_id, run_id, sku),
    FOREIGN KEY (workspace_id, run_id) REFERENCES catalog_app.processing_runs(workspace_id, id),
    CHECK ((included AND exclusion_reason IS NULL)
        OR (NOT included AND exclusion_reason IS NOT NULL AND exclusion_reason = 'unavailable'))
);

INSERT INTO catalog_app.workspaces (id, slug)
VALUES ('11111111-1111-4111-8111-111111111111', 'demo');

GRANT USAGE ON SCHEMA catalog_app, catalog_meta TO catalog_runtime;
GRANT SELECT ON catalog_app.workspaces, catalog_meta.schema_migrations TO catalog_runtime;
GRANT SELECT, INSERT ON catalog_app.processing_runs, catalog_app.result_items TO catalog_runtime;
GRANT UPDATE (status, input_count, included_count, excluded_count, finished_at,
    failure_code, failure_message, failure_details, failure_details_truncated)
ON catalog_app.processing_runs TO catalog_runtime;
