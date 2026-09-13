-- Explicit operator rollback only; application startup never executes this file.
DROP TABLE catalog_app.result_items;
DROP TABLE catalog_app.processing_runs;
DROP TABLE catalog_app.workspaces;
DROP SCHEMA catalog_app;
