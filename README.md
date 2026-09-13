# Catalog Workbench

A Next.js and Go application for validating product catalogs, applying deterministic rules, and
exporting reproducible results backed by PostgreSQL.

**Current code:** a working bounded CSV-processing slice for one trusted local operator.
**Specified next:** real owner authentication, connected mock sources, and mock Meta publication
with independent readback. Those additions and the required original UI/UX refinement are not yet
implemented. The broader product also retains its future website and creative experience.

## Try the current workflow

Select the built-in synthetic sample or upload a CSV, apply a literal title prefix and optionally
exclude unavailable products, inspect the result, then download exactly those stored output rows.

```csv
sku,title,price,currency,availability
ITEM-001,Desk Lamp,12.3400,USD,in_stock
ITEM-002,Travel Bottle,0,USD,out_of_stock
```

Input header order may vary; each required name appears exactly once. Input is limited to **1 MiB
and 1,000 products**. Prices remain exact decimal strings, and every row is validated before filtering.
Completed results survive application restart; raw uploaded bytes do not persist.

## Getting started

Run commands from this application repository. Prerequisites:

- Node.js **24.21.0** in the supported 24.x family and npm.
- Go **1.26.8**, as pinned by [go.mod](backend/go.mod).
- Docker Engine with the `docker compose` plugin, and Make.

### Native application with local PostgreSQL

For an existing workspace with legacy runtime records, follow the
[one-time migration instructions](docs/runbook.md#existing-runtime-records) after environment setup
and before ordinary lifecycle commands.

```sh
make setup-env
make setup-db
SOCIOH_COMMAND_CWD=frontend node scripts/dev.mjs exec -- npm ci --ignore-scripts --no-audit --no-fund
make run
```

The native URL defaults to [http://127.0.0.1:3000](http://127.0.0.1:3000). Startup runs the current
checksum-verified migration before serving. It does **not** create the specified future owner account.
`make run` builds the frontend and both backend executables, then starts the native application.
It requires the prepared environment, dependencies and database; it does not generate credentials,
set up/reset a database or restart an already running application implicitly. `make build` builds
without starting; `make start` starts an existing build.

```sh
make status
make restart
make stop
```

Stop/restart preserve database contents. Stop the native frontend before rebuilding its `.next`
output. Do not delete a volume or replace credentials to work around a setup error.

### Clean generated output

```sh
make clean
make cleanup
```

`clean` removes only `frontend/.next/` and `backend/bin/`. `cleanup` also removes
`frontend/.cache/`, `backend/.cache/` and `.cache/tmp/`. Both preserve `.env`, `.cache/runtime/`,
source files, database containers/volumes and verification evidence. They refuse while an owned
native application is live or a target fails ownership/symlink checks. Do not run cleanup alongside
builds or tests. All helper commands, including cleanup, require the documented Node version.

### Docker application

The same canonical environment is required. After `make setup-env`:

```sh
make container-build
make container-up
make container-status
```

The Docker URL defaults to [http://127.0.0.1:3100](http://127.0.0.1:3100). This uses a separate
database volume from native development. Use `make container-restart` or `make container-stop`
for its lifecycle; these do not delete data. See the [runbook](docs/runbook.md) for ownership guards,
database isolation and recovery details.

### Configuration and generated files

`make setup-env` creates the ignored root **`.env`** if absent. It preserves and validates existing
credentials; it does not overwrite them on repeat. [`.env.example`](.env.example) documents safe
placeholders only and is not live configuration. The three password settings are for local PostgreSQL
roles—not a user login or a real commerce/ad provider. Keep `.env` private and out of Git, screenshots,
logs and build contexts. Changing the file does not rotate passwords in an existing database volume.

Application-generated output stays in ignored paths: `frontend/.next/`, `frontend/.cache/`,
`backend/.cache/`, `backend/bin/` and `.cache/`. Build/runtime metadata can contain local paths and
must not be copied into published documentation. Source and documentation remain portable.

## Features and implementation status

| Capability | Status |
|---|---|
| Synthetic sample and CSV upload | Implemented |
| Whole-input validation, exact decimals, title prefix and unavailable-product exclusion | Implemented |
| Immutable PostgreSQL results, preview and CSV export | Implemented |
| Request/concurrency limits, scoped database roles and explicit migration/reset | Implemented for the current slice |
| Real owner login, sessions and membership authorization | Specified; not implemented |
| Shopify-like JSON and generic-feed connection/consent/discovery | Specified; not implemented |
| Mock Meta replacement, durable receipts and reconciliation | Specified; not implemented |
| Post-stability original UI/UX and revised browser acceptance | Required; pending |
| Live provider integrations, creative studio, audiences and hosted release | Later scope / separately gated |

This is not a certified channel-feed generator, an authenticated multi-tenant service or a live
advertising integration. Use synthetic, non-personal catalogs only. The application does not
automatically identify all PII. Loopback and Origin checks do not authenticate other local clients.

## Architecture and documentation

Next.js owns the interface and bounded BFF transport. One Go process owns catalog behavior and
orchestration; PostgreSQL owns durable run/results. The managers are code responsibilities, not
separate deployments.

- [Current architecture](docs/architecture.md): implemented processing sequence and Go struct/interface diagram.
- [Specified architecture](specs/001-catalog-workflow/architecture-diagrams.md): owner journey, publication/recovery sequence and provider-contract diagram, explicitly not implemented.
- [Runbook](docs/runbook.md): environment, commands, persistence, checks and evidence status.
- [Security record](docs/security.md): assessed controls, historical check scope and unresolved image findings.
- [Feature specification](specs/001-catalog-workflow/spec.md) and [task ledger](specs/001-catalog-workflow/tasks.md): reviewed scope and remaining implementation work.
- [API contract](specs/001-catalog-workflow/contracts/catalog-api.md): the **specified revised API**, not a description of every currently available endpoint.

## Development checks

```sh
make check-scripts
make check-go
make check-frontend
```

Prepare the environment/database first. Go integration checks use their dedicated database;
frontend checks include a production build, so stop the native frontend before running them.
Application tests do not launch a browser. The [verification record](docs/runbook.md#verification-record)
distinguishes executed checks from pending revised acceptance and deployment.

Changes should preserve exact catalog semantics, immutable completed results, applied migration
checksums and source/status traceability. Update affected tests and contracts together. Do not treat
an unchecked specification task or a diagram as implemented behavior.

## License

No application license has been declared in this repository. Bundled third-party tooling retains
its own notices; those do not establish a license for the application code.
