# Phase 1 catalog workflow: research and clarification

Status: specification research and lead-resolved defaults. Application implementation and deployment have not started. Read this document when assessing Go composition, persistence, processing limits, or the reasoning behind this feature's specification. The implementation directory arrangement remains a proposal until code work is approved.

## Direction and decision authority

The user's current direction is a bounded catalog workflow using Next.js, Go, and PostgreSQL: CSV or sample input → parse → validate → title-prefix and availability rules → preview and CSV export. SaaS Manager and Connector Manager are modules within the same Go deployment. There is one mock provider. This phase establishes a working vertical slice; it does not implement the full historical product blueprint.

The precise persistence behavior, demo workspace, execution limits, CSV contract, and interruption policy below are delegated specification defaults resolved by the lead. They are not claims that the user supplied these exact values or approved them in an earlier conversation. Keep that distinction when changing the governing specification.

The deployment topology under discussion contains three containers: Next.js, Go, and PostgreSQL. The two Go managers share one process. Next.js-to-Go and Go-to-database communication use private Compose networking. Later Coolify deployment remains a separate operational gate; no remote action was performed for this research.

## Go reference evidence

Three existing Go checkouts were inspected as organization references. Their business behavior, authorship, and runtime readiness were not adopted. Source locators below are relative to each reference checkout, not paths within this repository. The outer workspace source map resolves the neutral reference IDs to their exact private locations.

| Reference | Inspected source locations | Observed pattern and Phase 1 consequence |
|---|---|---|
| REF-GO-01 | `cmd/app/main.go:25`, `cmd/app/bootstrap.go:37`, `cmd/app/bootstrap.go:114` | A signal-aware `run` function loads configuration and logging, builds infrastructure and services, and registers handlers. Use an explicit composition root for the single Go application. |
| REF-GO-01 | `src/config/config.go:13`, `src/config/config.go:59`, `src/config/config_test.go:138` | Typed configuration is loaded centrally. The implementation uses global configuration state and environment mutation that tests reset. Retain typed startup configuration, with isolated loading and validation suitable for tests. |
| REF-GO-01 | `src/api/candles_stream_handler.go:14`, `src/api/candles_stream_handler.go:48` | An HTTP handler receives a service dependency, decodes transport input, and delegates using the request context. Keep catalog processing authoritative in Go. |
| REF-GO-01 | `src/api/server.go:33` | HTTP timeouts and graceful shutdown are owned by the server lifecycle. Carry cancellation into bounded processing and stop accepting work during shutdown. |
| REF-GO-02 | `cmd/app/bootstrap.go:101`, `src/vault/service.go:19`, `src/vault/service.go:35` | A repository, external client, policy, logger, and service-specific configuration are passed through constructors. Give each manager only the dependencies it consumes. |
| REF-GO-02 | `src/store/db/pg.go:16`, `src/store/db/pg.go:56`, `src/store/db/pg.go:79`, `src/store/db/pg.go:86` | Database configuration, connection construction, close, and health are explicit. The application owns one PostgreSQL connection pool and its lifecycle. The reference uses GORM; that observation does not select Socioh's database library. |
| REF-GO-02 | `src/store/vaultstore/store.go:17`, `src/store/vaultstore/store.go:60`, `src/vault/profit.go:5` | Interfaces provide persistence and policy boundaries. Use narrow persistence/provider contracts; the two deterministic catalog rules can remain concrete functions. |
| REF-GO-02 | `src/jsonhttp/jsonhttp.go:121`, `src/jsonhttp/jsonhttp.go:160`, `src/jsonhttp/jsonhttp.go:169` | Functional options configure optional client settings and an injected client. Reserve that pattern for optional construction settings; required dependencies remain explicit. |
| REF-GO-03 | `common/bootstrapper.go:59`, `rpc/settings/internal/svc/servicecontext.go:28`, `rpc/settings/internal/logic/setdefaultlanguagelogic.go:22` | A bootstrapper builds dependencies, a service context selects them, and logic receives the context. Preserve explicit dependency passing while keeping Phase 1 consumers smaller than the reference's shared container. |

### Adaptation limits

- REF-GO-01 `cmd/app/bootstrap.go:63` and REF-GO-02 `cmd/app/bootstrap.go:93` expose construction paths where later failure can follow successful resource acquisition. Phase 1 startup must release already-created resources before returning an error.
- REF-GO-02 `cmd/app/bootstrap.go:174` logs failed database health and returns success. Phase 1 requires PostgreSQL for completed results, so readiness must reflect database availability.
- REF-GO-02 `cmd/app/bootstrap.go:254` defines a background-service entry point whose wait function immediately returns. It supplies no evidence for a working queue or recovery engine, and Phase 1 uses synchronous processing.
- REF-GO-03 `pkg/postgres/pg.go:30` performs automatic schema migration during connection; `common/bootstrapper.go:92` builds many unrelated repositories. Phase 1 should use an explicit schema-management step and construct only its needed dependencies.
- REF-GO-01 `src/api/server.go:88` uses permissive CORS settings. The proposed private Next.js-to-Go route needs its own deliberate exposure and origin configuration.

## Clarification record

These questions were sent to the lead during reference research. The answers below govern the proposed Phase 1 specification unless revised through the active decision workflow.

| Question | Lead answer | Consequence |
|---|---|---|
| What survives restart? | Successful run metadata, immutable rule settings, normalized product rows, and transformed result rows persist in PostgreSQL. Raw CSV bytes are transient. | Recreate preview/export from the stored result. No persistent raw-file or object-asset store is needed. |
| What does the single mock provider represent? | One injected, in-process mock source returns raw CSV to the real parser. The downloadable output is produced by the real exporter. | Sample and uploaded input exercise the same processing pipeline; there is no mock destination. |
| Is processing synchronous or a recoverable job? | One bounded synchronous request, with no queue, automatic retry, or resume. Completed runs are retrievable by known run ID. The single Go instance marks leftover processing runs failed at startup. | Persist clear run outcomes without introducing durable worker infrastructure or claiming resumable processing. |
| What workspace/access behavior belongs in this phase? | One seeded demo workspace; no full authentication, agency model, or billing. | SaaS Manager supplies only the agreed demo-workspace and application-record behavior. Public exposure still requires the later operator-access gate. |
| What are the input bounds and invalid-row policy? | Defaults: 1 MiB CSV, 1,000 data rows, 30 seconds processing, and two concurrent Go runs. Schema or row errors invalidate the entire input. A valid input whose rows are all filtered out succeeds with a header-only export. | Validate the whole bounded input before accepting a completed result; distinguish invalid input from a valid empty result. |
| What happens if the caller disconnects or the deadline expires? | Propagate cancellation into Go processing; do not continue as detached work. Persist the failed/cancelled reason best-effort. If completion already committed, retain that completed result. | Export requires a committed completed run. A lost HTTP response does not roll back an already committed result or prove the processing failed. |

### Request and persistence boundary

Go owns validation, rule execution, processing limits, and persistence. Next.js supplies the UI and a backend-for-frontend envelope: it may reject an oversized or malformed request early, but it does not become a second implementation of catalog rules. Both uploaded and sample CSV enter the same Go parser.

The successful state, normalized rows, transformed rows, and immutable settings must commit consistently. A partially processed input must not become exportable. Startup recovery marks stale processing records failed; it does not reconstruct raw input or resume a run. This recovery rule assumes one Go instance and must be revisited before adding replicas.

Cancellation before completion stops further processing through the propagated request context. Persist its reason best-effort without extending the processing into a detached workflow. If a process crash or database failure prevents recording that outcome, the startup rule handles the remaining processing record.

The run ID is returned in the response. Phase 1 does not require a run-history UI, automatic POST retries, idempotency machinery, or lost-response recovery. A completed run can be fetched by a known ID; if the response carrying that ID was lost, the current UI may not expose the result. The user may deliberately submit a new run. Completed-run persistence is not a promise of indefinite retention; a cleanup policy remains later operational work.

## CSV and rule defaults

| Area | Specification default |
|---|---|
| Encoding and format | UTF-8, comma-separated CSV, fixed headers: `sku,title,price,currency,availability` |
| Source paths | Uploaded CSV or the injected mock source's raw CSV; both use the real parser |
| Identity | Unique, nonempty SKU within the input |
| Title | Nonempty title |
| Price | Nonnegative decimal value; exact decimal semantics rather than binary floating point |
| Currency | Three uppercase letters |
| Availability | `in_stock` or `out_of_stock` |
| Validation | Schema or row errors reject the entire input; validation details remain distinguishable from rule exclusions |
| Rules | Apply the title prefix, then exclusion of unavailable products, using the run's immutable settings |
| Ordering | Preserve source order among surviving rows |
| Preview/export | Read the same stored transformed rows and settings; export does not rerun a different transformation |
| Empty transformed result | A valid all-filtered input completes successfully; export contains the header only |
| Deferred flexibility | Header mapping, additional feed grammars, generalized expressions, and configurable pipelines are outside Phase 1 |

The numeric bounds are lead-selected defaults for the bounded slice, not measured throughput claims or user-provided production SLOs. Tests and observed costs can justify later changes through the specification.

## Proposed Go composition

The implementation plan should assign these responsibilities without installing a general dependency-injection framework or reproducing the reference applications' business modules:

1. **Entry and application lifecycle:** load validated configuration, create logging and PostgreSQL, construct modules and routes, start HTTP, and close resources on failure or shutdown.
2. **SaaS Manager module:** resolve the seeded demo workspace and the application-record responsibilities this slice actually needs.
3. **Connector Manager module:** coordinate source intake, the real parser, validation, deterministic rules, result persistence, preview, and export.
4. **Persistence adapter:** provide explicit operations for run status and atomic completed results through the shared PostgreSQL pool.
5. **Mock source:** return deterministic raw CSV through a narrow source contract; exercise the same parser and validation path as uploads.
6. **Transport:** decode requests, enforce the processing/admission limits, propagate context, and map typed outcomes to HTTP responses. Next.js consumes this contract for the visible journey.

Pass repositories and provider contracts directly to constructors. Parsing and the two rules should remain independent of HTTP, environment access, database handles, and container configuration. An application aggregate owns resources; business modules should receive their specific dependencies rather than the entire aggregate. Exact package names and directory structure remain the implementation plan's proposal until code work is approved.

## Verification evidence and proposed checks

The reference tests were read, not executed:

| Reference evidence | What it demonstrates in source | Limit |
|---|---|---|
| REF-GO-01 `src/api/candles_stream_handler_test.go:153`, `:242`, `:287` | Real routes and services are composed with local test servers and an in-memory dependency; assertions cover observable results. | This is a useful HTTP test shape, not proof that these tests currently pass or that Socioh works. |
| REF-GO-02 `src/api/health_handler_test.go:14`, `:43` | Injected healthy/failing dependencies exercise HTTP status and response bodies. | No real database readiness is established by those handler tests. |
| REF-GO-02 `src/velvet/client_test.go:11`, `:37` | Mocked HTTP responses exercise provider request/response mapping. | The tests replace a private client field; an explicit constructor seam would make substitution clearer. |
| REF-GO-03 `rpc/settings/internal/logic/setdefaultlanguagelogic_test.go:27`, `pkg/postgres/mock.go:11` | Constructed repositories support a behavioral logic test. | The database substitute is SQLite; it does not verify PostgreSQL-specific behavior. |

Phase 1 acceptance should exercise malformed headers/rows, duplicate SKUs, decimal validation, bounds, source failure, rule order, stable row order, all-filtered success, and identical preview/export values. Include an HTTP journey using the real parser/rules/exporter and mock source, plus PostgreSQL tests for atomic completion and restart retrieval. Exercise cancellation before completion, a committed result followed by lost response, startup recovery of incomplete runs, and concurrent-run admission. These are proposed checks; none have been executed for this artifact.

## Later deployment gate and deferred systems

Before public exposure through Coolify, establish operator access, TLS, request/body/time/concurrency limits across the full proxy path, and private service/database connectivity. Verify the three-container runtime independently of local tests. The seeded demo workspace is not a completed multi-tenant authentication system. Deployment approval and actual runtime evidence must be recorded separately.

Supabase, Redis, Kafka or RabbitMQ, ClickHouse, object storage, CDN, creative rendering, audiences, generalized authorization/agency workflows, and production-scale ingestion remain deferred. Their presence in historical designs or shared skill catalogs creates no Phase 1 dependency. This document does not execute any deployment, integration, database operation, or application code.
