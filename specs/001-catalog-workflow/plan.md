# Implementation Plan: Bounded Catalog Workflow

**Branch**: `master` (unchanged) | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-catalog-workflow/spec.md`. Product Phase 1 is the scope of this entire plan;
SpecKit's research/design/task-generation steps are workflow steps, not Product Phases 2 or 3.

**Status**: Specification design prepared for review. Source directories below are proposals and have
not been created. Application implementation and target-host deployment have not started.

## Summary

One browser workflow selects a mock sample or uploads canonical CSV, changes two rule controls,
processes it through Go, displays validation/results and downloads the completed CSV. Next.js owns
the interface and same-origin application-facing transport. One Go process owns SaaS demo context,
Connector Manager use cases, the real catalog pipeline and PostgreSQL persistence.

The external source is mocked before parsing. Parsing, validation, transformation and export remain
distinct packages with shared product/result types. Required infrastructure is constructor-injected.
No provider, queue, renderer, Supabase service or extra manager deployment is introduced.

## Technical Context

**Language/Version**: Go; Next.js App Router with React and TypeScript. Pin mutually supported stable
versions and lockfiles in T002 before implementation; framework versions are not inferred from the
historical blueprint. Record selections in the implementation toolchain files.

**Primary Dependencies**: Go standard library for HTTP, CSV, contexts and deterministic processing;
a PostgreSQL driver/pool selected during toolchain pinning; Next.js server routes and React UI.
No DI container is required. Library adoption must preserve the stated constructor contracts.

**Storage**: PostgreSQL private application schema, ordinary SQL migrations. Persist demo workspace,
runs/settings and normalized/transformed result rows. Raw CSV is bounded transient input; export
is generated from stored rows, without persistent object/blob infrastructure.

**Testing**: Go testing with handwritten callback mocks, supported by browser checks for the same
four acceptance scenarios (H1, H2, S1, S2). Use real PostgreSQL for migration/round-trip assertions.
No provider integration or broad performance/security test campaign is implied.

**Target Platform**: Linux Docker application, later deployed through the owner's hosting panel.

**Project Type**: Web interface plus one Go backend and PostgreSQL in one Compose application.

**Performance Goals**: Enforce admission bounds, deadlines and deterministic output. No throughput,
million-SKU benchmark or latency SLA is claimed.

**Constraints**: Lead defaults from the spec: 1 MiB, 1,000 rows, 30-second processing deadline,
two admitted runs, one Go process; reject excess work without queueing.

**Scale/Scope**: One seeded demo workspace. CSV/sample input and download only. No agency/auth/billing,
live publication, audience engine, creative rendering, Redis, broker or ClickHouse.

## Constitution Check

- One bounded complete workflow: satisfied by US1/US2 and FR-001 through FR-010.
- Explicit composition: one Go deployment; managers receive narrow dependencies; mock supplies raw CSV.
- Single business authority: Go produces validation, transformed results and export; Next.js delegates.
- Small verification scope: exactly two happy/two sad acceptance scenarios; execution remains pending.
- Privacy and portability: no local paths or PII in application artifacts; PostgreSQL-only schema;
  no Supabase API role grants or authentication coupling.
- Scope gate: current deliverable is specifications and tasks, not code or remote deployment.

Post-design review must compare the final contracts/data model/tasks with these gates.

## Responsibility Contract

| Component | Phase 1 responsibility | Deferred extension |
|---|---|---|
| Next.js UI | Sample/upload selection, rule controls, processing/error state, full bounded preview and download | Richer product/admin surfaces |
| Next.js server routes | Validate request envelope, use fixed server-side workspace context, forward to Go with cancellation/timeouts; no business-rule duplication | Real actor/session resolution |
| SaaS Manager | Resolve one seeded demo workspace and scope access to its processing records | Auth, organizations, roles, agencies, billing, metering |
| Connector Manager | Discover mock samples, acquire upload/sample bytes, coordinate processing runs/results | Provider connections/authorization, synchronization and webhooks |
| Catalog parsing | Canonical CSV decoding, basic trimming/typed normalization and limits | Multiple source formats and mappings |
| Catalog validation | Required fields, unique identity, decimal/availability/text checks and bounded issues | Destination and richer business validation |
| Catalog transformation | Literal title prefix and unavailable-product exclusion | Configurable mappings, conditions and versioned rules |
| Catalog export | Deterministic CSV from completed stored results | Channel serializers/publication |
| PostgreSQL adapter | Workspace-scoped run/result reads and transactional completion | Validated Supabase migration and richer tenancy |
| Mock source | Raw synthetic CSV and test-only callback failures through the source interface | Live source adapters |

Manager names identify code responsibility, not separate services. Export is real behavior; no
destination mock is needed for a file download. No webhook or OAuth endpoint is exposed just to
represent future connector capabilities.

## Composition and Lifecycle

- `main` creates the root signal context, loads validated typed configuration and invokes bootstrap.
- Bootstrap constructs logger, one database pool, SaaS demo context, source implementation, processor,
  repository, Connector Manager, HTTP handlers and server; it owns cleanup and graceful shutdown.
- Use small consumer-facing interfaces where a dependency must be replaced. Concrete implementation
  structs receive required dependencies through `New(...)` or typed dependency parameters.
  Functional options configure optional mock behavior; do not hide required dependencies in options.
- Catalog packages share types from `catalog/model`; stage packages do not import a coordinator
  that imports them back. The pipeline coordinates pure stages; Connector Manager coordinates I/O.
- Database construction does not run automatic schema migration. Migrations run through a separate,
  explicit lifecycle command/task and are verified against PostgreSQL.
- Partial bootstrap failures close already-open resources. Database unavailability makes readiness
  fail rather than silently falling back to memory.
- Processing is request-bound. Propagate cancellation from the BFF; configure its upstream timeout
  above the Go deadline. Do not continue work through detached goroutines.
- Complete result rows and terminal status commit together. Failure/cancellation records are
  best-effort if infrastructure is unavailable. A committed completion remains valid after a lost
  response; no automatic POST retry is supplied.
- On startup, the single Go instance marks leftover `processing` runs interrupted. Multi-worker
  leasing, durable retries, checkpoints and idempotent submission are later work.

## PostgreSQL and Future Supabase

Use a dedicated non-public application schema and a runtime database role with required privileges
only. Every repository operation is workspace-scoped even though Phase 1 uses one synthetic workspace.
Keep UUID identities, declared constraints/indexes, explicit transactions and timestamped SQL migrations.

Do not use `auth.users`, `auth.uid()`, service-role keys, storage APIs or browser-to-database access.
Later Supabase adoption must validate database versions/extensions, migration replay, identity mapping,
role grants, schema exposure and RLS policies. PostgreSQL compatibility reduces coupling; it does not
guarantee a zero-change migration or prove tenant isolation.

## Project Structure

### Documentation (this feature)

```text
.specify/
  memory/constitution.md
  feature.json
  scripts/bash/
  templates/
specs/001-catalog-workflow/
  spec.md
  plan.md
  research.md
  data-model.md
  contracts/catalog-api.md
  quickstart.md
  tasks.md
  checklists/requirements.md
```

### Source Code (repository root; proposed, not created)

```text
frontend/
  src/app/page.tsx
  src/app/api/catalog/samples/route.ts
  src/app/api/catalog/runs/route.ts
  src/app/api/catalog/runs/[id]/route.ts
  src/app/api/catalog/runs/[id]/export/route.ts
  src/components/catalog-workflow.tsx
  src/lib/catalog-client.ts
backend/
  cmd/app/main.go
  cmd/app/bootstrap.go
  internal/config/config.go
  internal/saas/service.go
  internal/connector/manager.go
  internal/connector/source/source.go
  internal/connector/source/upload.go
  internal/connector/source/mock/source.go
  internal/catalog/model/product.go
  internal/catalog/parsing/csv.go
  internal/catalog/validation/validate.go
  internal/catalog/transformation/rules.go
  internal/catalog/pipeline/process.go
  internal/catalog/export/csv.go
  internal/store/postgres/runs.go
  internal/httpapi/router.go
  internal/httpapi/catalog.go
  internal/httpapi/catalog_test.go
  internal/connector/manager_test.go
  migrations/
tests/e2e/catalog-workflow.spec.ts
compose.yaml
Makefile
docs/runbook.md
```

**Structure Decision**: This tree is a concrete reviewable proposal matching the supplied main/bootstrap,
constructor and module preferences. It is not evidence of source creation or final user approval.
One Go module lives under `backend/`; one frontend package under `frontend/`. Do not add empty
Phase 2/3 implementation modules or restructure the outer workspace.

## Deployment Gate

Docker packaging is Phase 1 work after the workflow implementation. Run Next.js, Go and PostgreSQL
as three containers in one application; SaaS/Connector Manager are not additional deployments.
Only the intended frontend ingress is exposed. Database credentials and internal service URLs remain
server-side; database/backend are not public ports.

Before target-host publication, agree on restricted demo/operator access, TLS/origin configuration,
upload/admission limits, database retention/reset/backup, secrets and resource settings. Full product
authentication remains Phase 2, so do not silently expose an unrestricted multi-user upload service.
Configure and verify the target host only in the later deployment task.

## Complexity Tracking

No constitution exception is needed. Extension seams are narrow package contracts. Real providers,
message brokers, object storage/CDN, rendering and audience processing are ledger entries for later
phases, not current runtime dependencies.
