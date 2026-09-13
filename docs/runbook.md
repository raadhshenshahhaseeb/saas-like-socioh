# Operating and verification guide

This guide operates the **current CSV-processing slice**. The revised owner authentication,
connected-source and mock-publication journey is specified but not implemented. Commands here do
not bootstrap those future capabilities. See [current architecture](architecture.md),
[revised acceptance](../specs/001-catalog-workflow/quickstart.md), and the
[active tasks](../specs/001-catalog-workflow/tasks.md) for that distinction. Hosted release remains
separately gated.

## Prerequisites

Use Node.js 24.21.0 in the supported 24.x family, npm, Go 1.26.8, Make, and Docker Engine with the
`docker compose` plugin. The frontend lockfile pins Next.js 16.3.5, React 19.3.0 and TypeScript 5.9.3;
the Go module pins pgx/v5 5.11.0 and the patched x/text 0.39.0. Keep Go checksum verification enabled.
Dockerfiles retain public upstream image pins. Commands below run from the application repository.

The native and container helpers start applications and databases, not browsers. Use a free local
port; never terminate an unrelated listener to reclaim one. Ordinary operations preserve volumes.

## Canonical environment

```sh
make setup-env
```

The root `.env` is the canonical private configuration file. Setup creates it only when absent,
reuses compatible existing credentials, otherwise generates them, and validates without overwriting
on repeat. A detected conflict fails without displaying values. [`.env.example`](../.env.example)
contains placeholders only; copying it unchanged does not produce valid live configuration.

| Required key | Role |
|---|---|
| `POSTGRES_ADMIN_PASSWORD` | Local PostgreSQL provisioning administrator |
| `POSTGRES_MIGRATOR_PASSWORD` | Schema migration/reset operator |
| `POSTGRES_RUNTIME_PASSWORD` | Least-required application database access |

Values use the helper's strict unquoted base64url-safe format, without shell/dotenv interpolation.
Frontend-local `.env` and `.env.*` files other than placeholder-only `.env.example` are rejected,
including directories and broken links at those names; only the root `.env` is canonical.
Preserve file privacy and ignore rules;
never commit, log, photograph or paste the values into documentation. These are database credentials,
not a demo-owner login or real provider tokens. The helpers derive scoped connection settings and
pass only the appropriate credentials to each process. Next.js receives no database credentials.

Changing `.env` does not change passwords already stored in an initialized database volume. If
configuration and database state disagree, preserve the data and resolve the credential mismatch;
do not silently regenerate credentials, delete a volume or weaken authentication. Actual owner
account provisioning belongs to the unimplemented revision, not this setup command.

### Existing runtime records

If an earlier helper version left ownership records outside the application repository, run the
explicit one-time metadata migration after preparing `.env` and before ordinary lifecycle commands:

```sh
make migrate-runtime
```

It relocates verified ownership records under both native/Compose locks. It does not start or stop
services, delete database contents or automatically remove historical caches. A conflict is a reason
to inspect the reported state, not to run both helper generations concurrently.

### Generated artifacts

| Ignored location | Contents |
|---|---|
| `frontend/.next/` | Next.js build output |
| `frontend/.cache/` | npm and TypeScript build caches/metadata |
| `backend/.cache/go-build/`, `backend/.cache/go-mod/`, `backend/.cache/gopath/` | Go build, module and toolchain workspace caches |
| `backend/bin/` | Built local backend executables |
| `.cache/tmp/` | Application tool scratch files |
| `.cache/runtime/` | Private lifecycle records, logs, locks and generated runtime configuration |

Build/runtime metadata may contain local paths inside these ignored artifacts. Secrets belong only
in the canonical `.env` and explicitly scoped private runtime environment files; accidental secret
capture in build caches or logs remains a privacy failure. Ignore rules alone do not make sensitive
contents acceptable. These artifacts stay separate from portable source/documentation and are not
published handoff material. Browser automation dependencies and profiles are not part of this
application or these build commands.

## Native start, stop and restart

After environment setup and any required metadata migration:

```sh
make setup-db
SOCIOH_COMMAND_CWD=frontend node scripts/dev.mjs exec -- npm ci --ignore-scripts --no-audit --no-fund
make run
```

The default URL is `http://127.0.0.1:3000`. Startup runs the current checksum-verified migration with
operator credentials, starts Go with runtime-only credentials, then starts Next.js and checks
readiness. It does not install a global toolchain or create the specified owner/auth flow.

`make run` performs the frontend production build, builds both current Go executables and starts
native services under one native lifecycle lock. It requires existing `.env`, installed dependencies
and a prepared database; it does not auto-create credentials, set up/reset DB state or replace a
live native application. `make build` performs the builds without starting. `make build-backend`
remains available for backend-only builds, and `make start` uses existing build outputs.

```sh
make status
make restart
make stop
```

Stop preserves PostgreSQL/results. Restart verifies owned process identity and stops the previous
applications before replacement. Stop native Next.js before `make check-frontend` or another build
that changes its served `.next/` directory.

The native PostgreSQL helper uses loopback port 55432 and an owned data volume. Databases are
`catalog_demo` for normal local use, `catalog_test` for controlled acceptance, `catalog_failure`
for the test-only source-failure composition, and `catalog_integration` for Go integration checks.
Resetting one must not disrupt another's evidence. Helpers isolate their credentials/environments;
do not run destructive integration setup against a demonstration database.

## Clean and cleanup

Use these commands in the same Linux host/PID namespace as the native runtime records, with
permission to inspect those processes. Their concurrency protection covers the recorded native
stacks and participating helpers. Stop any manually launched, unrecorded build/server processes
before cleanup; do not run destructive cleanup from a sandbox that cannot inspect owned processes.

```sh
make clean
make cleanup
```

| Command | Exact generated targets |
|---|---|
| `make clean` | `frontend/.next/`, `backend/bin/` |
| `make cleanup` | The clean targets plus `frontend/.cache/`, `backend/.cache/`, `.cache/tmp/` |

These operations require the documented Node version, take both helper lifecycle locks, and refuse
if an owned native demo/acceptance/failure process is live. Unsafe target/ancestor ownership or
symlink roots are rejected. They preserve canonical `.env`, all `.cache/runtime/` records/scoped
environment files/logs, source, every database container/volume and separate verification evidence.
They do not stop Docker applications or erase their data. Cleared outputs can be rebuilt; cleared
dependency caches may need downloading again. Coordinate cleanup with builds/tests rather than
running them concurrently. This guide documents the commands; it does not claim they were run on
the working application's artifacts.

## Current data and request behavior

Next.js supplies the sample/upload interface and bounded BFF. Go composes a workspace service,
Connector Manager and real catalog stages in one process. PostgreSQL holds workspaces,
processing_runs, result_items and migration metadata. The current workspace constant is an input
scope, not an authenticated account or multi-tenant policy.

| Control | Current behavior |
|---|---|
| CSV | UTF-8, optional BOM; exact five header names once each in any order; 1 MiB/1,000 product bound |
| Validation | All rows checked before filtering; duplicate SKUs, malformed values, control/formula-leading text rejected |
| Money | Exact decimal strings; at most 14 integer/four fractional digits; validated `numeric(18,4)` storage |
| Rules | Literal title prefix, then optional exclusion of out-of-stock products; stable order |
| Result | Settings/rows immutable after completion; valid all-excluded result has header-only CSV |
| Admission | Two POST/four read-export requests per process; excess work rejected, not queued |
| Deadlines | Go header 5 s/body 10 s/processing 30 s/read 5 s; conditional failure cleanup 2 s |
| BFF | Upstream POST 35 s within total 45 s; bounded raw forwarding and 4 MiB response cap |
| Database | Pool maximum five, acquire bound 2 s; runtime role has no schema ownership or completed-result mutation |
| Storage | 100 runs per workspace including failures; no automatic pruning |

The BFF checks exact Origin and a custom request header, forwards only permitted transport data,
and propagates cancellation. React text rendering and response/CSP controls reduce browser risks;
they do not authenticate another local client. Next.js's HTTP header defaults are separate from
Go's limits and must be assessed at the hosted ingress gate.

Raw input is transient. Source/validation failure after admission records failed only when the run
is still processing. Completion commits all rows/counts together. A lost response does not roll back
a committed result; reopen a known result URL to inspect its recorded state. Startup marks leftover
processing rows failed/interrupted, without resume. Never overlap Go instances against that state.

Migration 001 is embedded and recorded with a checksum in `catalog_meta.schema_migrations`.
The revised ordered runner, migration 002 and database-session lifecycle guard remain planned;
do not describe them as current protections. Full owner/source/publication data contracts are in
the [revised data model](../specs/001-catalog-workflow/data-model.md).

## Explicit current-slice reset

Reset deletes stored runs/results only in the exact selected demo database/workspace. It retains
the database and volume. Export needed results first; deleted rows require an existing backup to
recover. Normal restart does not reset data.

```sh
node scripts/dev.mjs stop --stack=demo
node scripts/dev.mjs reset --stack=demo --confirm-demo-reset
```

The helper refuses while the selected owned application is live; the current Go command also
refuses active processing rows. A stale processing row after a crash needs normal startup recovery
and a clean stop before reset. The specified exclusive database lifecycle lock and separate
mock-provider reset are not implemented; do not substitute future command contracts for this path.

## Docker application

After `make setup-env` and any required metadata migration:

```sh
make container-build
make container-up
make container-status
make container-restart
make container-stop
```

Default URL: `http://127.0.0.1:3100`. `SOCIOH_COMPOSE_PORT` selects another free local port;
`SOCIOH_COMPOSE_DATABASE` selects the allowed demo/test database. Compose has its own owned volume,
separate from native development. Only the frontend ingress is published to loopback. API/database
networks are private; application images are non-root with read-only filesystems, dropped capabilities,
health checks and resource/log limits. PostgreSQL's entrypoint initialization and final server user
are distinct; do not equate that bootstrap with the application image's non-root user.

The helper provisions roles and executes a one-off migration before serving. Runtime Go receives
no migration credentials. Restart stops app services first, retaining the DB. Stop preserves
containers/data; there is no automatic volume deletion. Current Docker operation still demonstrates
the CSV slice, not the specified owner journey.

## Application checks

```sh
make check-scripts
make check-go
make check-frontend
```

Prepare the canonical environment and isolated PostgreSQL first. `check-go` runs race/integration
tests and vet against the integration database. `check-frontend` runs type checking, BFF tests and
a production build. Stop the native frontend before that build. Script checks and unit checks do
not establish live database or browser acceptance.

Additional current dependency checks, when intentionally refreshing their evidence:

```sh
SOCIOH_COMMAND_CWD=backend node scripts/dev.mjs exec -- go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...
SOCIOH_COMMAND_CWD=frontend node scripts/dev.mjs exec -- npm audit --omit=dev
```

Application tests do not start a browser. The [revised quickstart](../specs/001-catalog-workflow/quickstart.md)
defines the future owner H1/H2/S1/S2 requirements and their post-stability design/browser gates.
Do not attach its new scenario meanings to historical sample-only checks.

## Verification record

Evidence is scoped to the code/configuration actually inspected or executed. Exact local image
identities, command records and machine-specific mappings remain in the private evidence registry.
No hosted release has occurred.

| Evidence | Recorded result | Scope and remaining limit |
|---|---|---|
| Earlier Go race/integration/vet | Passed after raw-SKU and UTC timestamp corrections | Real CSV pipeline, DB transactions/roles/caps/recovery; no revised auth/providers/publication. |
| Fresh isolated PostgreSQL/native HTTP recheck (`VERIFY-CSV-NATIVE-02`) | Passed with forced fresh Go test execution, race detection, all four required DB test groups, vet, backend build and native helper startup | Current CSV slice through the canonical environment/new artifact paths: exact sample rows/counts/CSV/UTC, invalid-input refusal and preservation of prior valid output. No browser or revised-owner acceptance. |
| Earlier frontend checks | Typecheck, 11 BFF tests and production build passed | Implemented CSV interface/BFF, not revised owner acceptance. |
| Current metadata-placement frontend recheck | Lead reports typecheck and 11 BFF tests passed with the pinned Node version | Confirms those checks after TypeScript metadata relocation; no new end-to-end/DB claim. |
| Earlier native browser checks | Sample, equivalent upload with restart, invalid/oversized input and injected source failure passed | Smaller pre-UTC slice. Its old H1/H2/S1/S2 labels are historical and do not close revised scenarios. |
| Go advisory correction | x/text updated to 0.39.0; retained pinned govulncheck record reports no vulnerabilities found | Point-in-time earlier dependency graph; planned authentication dependencies need a fresh check. |
| CSV-slice container work | Build/start records and scoped hardened image scans exist | No complete final revised Docker/browser acceptance; residual OS findings remain in [security.md](security.md). |
| Canonical environment/runtime-artifact change | Helper checks and command/path review are recorded; the isolated native recheck exercised the prepared canonical environment and current CLI | The native check used a new disposable DB, not existing demonstration volumes. It does not establish hosted or revised-owner behavior. |
| Revised owner journey | Specification review complete; implementation/acceptance pending | T029 onward, stability/design/browser/security gates remain open. |

The fresh recheck used a newly owned pinned PostgreSQL 17 container with tmpfs data and no named
volume. Go tests ran with `-count=1 -race -p 1 -tags=integration`; the named integration groups were
required to pass rather than skip. The captured native acceptance processes stopped, and the exact
fixture container was confirmed removed. The existing native database remained stopped; existing
Docker application/volume state was not a restart/reset target.

An initial attempt (`VERIFY-CSV-NATIVE-01`) passed application checks but returned nonzero because
it checked automatic container removal immediately after stop. A subsequent read-only check
confirmed removal. That record is preserved; the corrected bounded observation and forced-fresh
test run produced the separate clean result above. No repeated stop/delete was used to force it.

The first retired browser attempt failed before navigation and contributes no acceptance pass.
New evidence is recorded separately; historical checks are not silently replaced or broadened.

## Hosted release gate

Current hosted tasks are **T070/T071**, not the historical T026/T027 identifiers. Before exposure,
separately agree the target, operator access, domain/TLS, authenticated demo boundary, trusted
proxies and request limits, secrets, resources, backup/restore/retention/reset, monitoring and
stop-before-start deployment. Then verify the actual deployed revision, migration, exposure, health,
complete owner workflow and persistence. Local code, containers and simulated providers do not
establish hosted readiness or real platform access.
