# Security record: implemented CSV slice

Reviewed 2026-09-13. This record covers the implemented CSV slice and the historical check snapshots
identified below. The [revised execution contract](../specs/001-catalog-workflow/execution.md) adds
real owner authentication, connected providers and mock publication; those capabilities are specified
but not implemented or assessed here. This is not a comprehensive security audit, penetration test,
or production certification. The [runbook](runbook.md#verification-record) owns evidence status.

## Scope and trust boundaries

The current code is a local demo for one trusted operator and one seeded workspace. Inputs must be
synthetic/non-personal product catalogs. The application does not detect or certify the absence of
PII in arbitrary free text. It currently has no account system, provider authorization, publication
or proven multi-tenant access model. These absences describe current code, not exclusions from the
revised project scope.

| Boundary | Implemented control | Limit |
|---|---|---|
| Browser → Next.js | Same-origin application routes; exact configured Origin and `X-Catalog-Request: 1` for POST; admission before bounded body reading. | Origin and a custom header prevent unwanted browser-origin requests; they are not authentication against a native client that can supply headers. Loopback access remains the current deployment boundary. |
| Next.js → Go | Fixed server-only origin and allowed paths; bounded raw JSON/multipart forwarding; only needed transport headers are forwarded. | Browser credentials and workspace headers do not establish authority. Next.js is separate; SaaS Manager and Connector Manager share the Go process. |
| Go → PostgreSQL | Parameterized, workspace-scoped SQL; runtime and migration credentials separated; explicit schema/seed readiness and transactional result completion. | The demo workspace filter is not a full user/organization authorization system. Database migration and reset remain privileged operator actions. |
| Operator → local runtime | Workspace ownership checks, lifecycle locks, stop-before-start, private credentials and explicit reset confirmation. | Host security and an authenticated hosted operator gateway are separate assessments and deployment gates. |

Source anchors: [`createCatalogProxy`](../frontend/src/lib/server/catalog-proxy.ts#L72), [`proxyCatalog`](../frontend/src/lib/server/catalog-service.ts#L7), [`Store.Ready`](../backend/internal/store/postgres/runs.go#L58), and the [local launcher](../scripts/dev.mjs).

## Implemented controls and corrections

**Resource bounds.** Both application processes admit two POST requests before reading their bodies and four concurrent read/export requests. CSV is limited to 1 MiB and 1,000 rows; JSON to 16 KiB; multipart to the CSV bound plus 16 KiB overhead; upstream responses to 4 MiB; validation details to 100 issues. Go uses a 30-second whole-POST deadline, five-second GET/export deadline, ten-second body deadline, and at most two seconds for conditional failure recording. BFF POST budgets are 35 seconds upstream and 45 seconds total. Go HTTP configuration adds five-second header, 45-second write, and 60-second idle timeouts. The database pool has at most five connections with a two-second acquisition bound. Next.js header defaults are distinct from Go's setting and require assessment at the later ingress gate. See [`config.Load`](../backend/internal/config/config.go#L28), [`Handler.withLimit`](../backend/internal/httpapi/catalog.go#L82), [`Handler.body`](../backend/internal/httpapi/catalog.go#L152), [Go server construction](../backend/internal/app/app.go#L56), and [BFF limits](../frontend/src/lib/server/catalog-proxy.ts#L76).

**Input and output integrity.** Raw JSON and multipart bytes reach Go unchanged, preserving duplicate-field detection. The real parser validates fixed CSV headers and every row before exclusion. Prices use bounded lexical decimals and PostgreSQL `numeric(18,4)` without floating point. Original and prefixed titles are checked for control characters and formula-leading text. The raw-SKU check was corrected to reject quoted leading/trailing TAB characters before whitespace trimming; its regressions first failed, then passed after the fix. See [`parsing.CSV`](../backend/internal/catalog/parsing/csv.go#L64), [`validation.Products`](../backend/internal/catalog/validation/validate.go#L29), and [pipeline regressions](../backend/internal/catalog/pipeline/process_test.go).

The browser review also found a correctness discrepancy: database timestamps were rendered with the process's non-UTC offset. `Store.Get` now normalizes both timestamp fields to UTC before transport. `TestRunTimestampsUTC` first reproduced the mismatch, then passed against PostgreSQL in a subprocess with a non-UTC timezone, without mutating shared `time.Local`. Full race/integration and vet checks passed after that correction. This is API-contract correctness evidence, not a security vulnerability. See [`Store.Get`](../backend/internal/store/postgres/runs.go#L229) and [the regression](../backend/internal/store/postgres/runs_integration_test.go#L85).

**Persistence and export.** The workspace run cap defaults to 100, including failures. `Store.Create` serializes count-and-insert using a transaction advisory lock and reports `storage_capacity_exceeded`; there is no automatic expiry or public reset route. `Store.Complete` commits result rows, counts and terminal state together. Failure recording only updates a still-processing run, preserving completed data after an uncertain response or commit acknowledgment. Known completed results survive restart, and export serializes their stored projection rather than recomputing mutable rules. A valid all-excluded result produces a header-only CSV; invalid input produces no completed export. See [`Store.Create`](../backend/internal/store/postgres/runs.go#L95), [`Store.Complete`](../backend/internal/store/postgres/runs.go#L130), [`Store.Fail`](../backend/internal/store/postgres/runs.go#L180), and [`Handler.read`](../backend/internal/httpapi/catalog.go#L184).

**Database and operator privileges.** The migration role owns schema creation; runtime grants permit needed reads/inserts and limited run-status updates. Migration version and SHA-256 checksums are verified. Reset checks the exact configured demo database, seeded workspace and operator role, requires CLI confirmation, and refuses active processing runs. It deletes only that workspace's run/result rows. Single-instance startup marks interrupted runs failed; overlapping Go replacements are not supported. See [SQL grants](../backend/migrations/202609130001_catalog.up.sql#L66), [`migrations.Verify`](../backend/migrations/migrations.go#L77), [`migrations.Reset`](../backend/migrations/migrations.go#L104), and [operator command handling](../backend/cmd/app/main.go).

**Response and credential safety.** Product strings render through ordinary React text interpolation. API responses use no-store and nosniff; CSV uses a fixed attachment filename. Errors exclude raw CSV, filenames, SQL and dependency exceptions. Server-only configuration and launcher scopes keep database credentials out of Next.js. UI copy was corrected to preserve uncertainty after transport/database/deadline failures instead of asserting that no completed result exists. The copyable CSV header was also corrected. See [server configuration](../frontend/src/lib/server/catalog-service.ts), [response controls](../frontend/src/lib/server/catalog-proxy.ts#L136), and [`completionUncertain`](../frontend/src/components/catalog-workflow.tsx#L19).

**Packaging and test separation.** The production Go image contains only the `cmd/app` binary, runs as a non-root user, and has no public fault-injection route. `cmd/testserver` requires the `testfixture` build tag and supplies a failed source through the same application constructor and PostgreSQL path. It is excluded from the production image. Build contexts exclude credentials and local artifacts. Compose specifies private backend/database access, separate API/database networks, read-only app filesystems, dropped capabilities and bounded resources. Source review confirms these declarations; runtime effectiveness must be verified separately. See [backend Dockerfile](../backend/Dockerfile), [backend context exclusions](../backend/.dockerignore), [test-only composition](../backend/cmd/testserver/main.go), and [Compose configuration](../compose.yaml).

Historical helper findings were corrected in source: exclusive credential creation, native process
identity handling for replaced executables, and owned app-service cleanup after failed Compose startup
while retaining the database. This record does not claim simulated coverage of every helper failure
path. The subsequent canonical `.env` and application-local artifact changes require their own checks;
historical helper review is not proof of the revised setup path. Real credentials belong only in
ignored private configuration, never in `.env.example`, documentation or image build contexts.

## Dependency advisory and executed evidence

The initial lead-run Go vulnerability check reported **GO-2026-5970** through the dependency graph involving pgx and `golang.org/x/text v0.29.0`. The official advisory describes an infinite-loop condition in Unicode normalization involving invalid UTF-8 and identifies versions before `v0.39.0` as affected. The dependency was updated to `v0.39.0`; `x/sync` resolved to `v0.21.0`. This is an advisory-based dependency correction, not a reproduced exploit against the demo. [Primary Go advisory, accessed 2026-09-13](https://pkg.go.dev/vuln/GO-2026-5970), [current module pins](../backend/go.mod).

| Evidence | Result and attribution | What it establishes |
|---|---|---|
| `go test -mod=readonly -race -p 1 -tags=integration ./...` | Backend owner executed successfully after the raw-SKU, dependency and UTC transport corrections, using only the dedicated integration database. | Earlier sample/upload/invalid-input/source-failure cases plus parser, admission, cancellation, persistence, timestamp and concurrency assertions; no race detected in executed paths. This is not revised owner-journey acceptance. |
| `go vet -mod=readonly -tags=integration ./...` | Backend owner executed successfully on the same dependency set. | The configured static checks passed; this is not comprehensive vulnerability detection. |
| Database integrity cases | Executed in `TestRunsIntegration` and `TestRunsCapacityRollbackAndRoleIntegrity`. | Migration replay, exact decimal round trip, known-result restart retrieval, conditional failure behavior, concurrent run cap, rollback without partial rows, denied runtime result mutation, exact reset target and checksum-drift rejection. |
| BFF/UI checks | Retained lead check ledger attributes successful typecheck, 11 BFF tests and production build to the frontend owner after corrections. BFF/UI source was independently cross-reviewed by the backend owner. | Source controls and reported transport tests; these do not replace actual Brave interaction or production-header evidence. |
| Patched Go advisory scan | Retained lead check ledger records pinned `govulncheck v1.8.0` returning `No vulnerabilities found.` after the update. This reviewer inspected that ledger; the lead executed the scan. | No reported vulnerabilities from that tool/database/code snapshot; no future-advisory or exploit-proof guarantee. |
| Patched native/container build and start | Lead reports successful rebuild and local Compose startup after the correction. | Build/start evidence is separate from final image analysis, browser acceptance and hosted verification. |
| Fresh isolated PostgreSQL/native HTTP recheck (`VERIFY-CSV-NATIVE-02`) | Executed `go test -json -count=1 -mod=readonly -race -p 1 -tags=integration ./...`, required the four named PostgreSQL groups to pass, then vet, backend build and native CLI/HTTP smoke. | Current CSV code and canonical environment/artifact path: exact sample/CSV/UTC and invalid-input/no-export behavior. No browser, revised authentication/provider/publication, hosted or new image-vulnerability claim. |

Test anchors: [Go HTTP checks](../backend/internal/httpapi/catalog_test.go), [four acceptance groups](../backend/internal/httpapi/catalog_integration_test.go), [database checks](../backend/internal/store/postgres/runs_integration_test.go), and [BFF checks](../frontend/src/lib/server/catalog-proxy.test.ts). Integration guards require the dedicated local integration database and expected roles before any migration/reset. Private command records and browser tooling remain outside this application repository.

The fresh recheck used only new disposable PostgreSQL data, with exact fixture identity/label checks
and no named volume. Captured native processes stopped and the fixture was confirmed removed.
The first attempt's asynchronous auto-removal timing assertion remains recorded separately as
`VERIFY-CSV-NATIVE-01`; the successful rerun fixed the observation window rather than hiding that
failure. Existing databases and the separate Docker application were not restart/reset targets.

## Local image assessment

The lead scanned owned offline image archives using SHA-verified Grype 0.118.0 with a valid vulnerability database built 2026-09-12. This reviewer independently inspected the initial/hardened JSON, package locations, selected offline image metadata and primary advisories. No exploit probes or exhaustive native-library call-graph audit were performed. Counts are scanner matches, not confirmed exploits or unique advisories.

| Image snapshot | Initial total / Critical / High | Hardened total / Critical / High |
|---|---|---|
| Go backend | 0 / 0 / 0 | The scanned digest predates the UTC-only correction; any rebuilt image requires its own recorded identity/check. |
| Next.js frontend | 227 / 7 / 56 | 213 / 7 / 51 |
| PostgreSQL | 416 / 28 / 86 | 411 / 28 / 85 |

The hardened frontend evidence ID is `IMG-CSV-WEB-02`; hardened PostgreSQL is `IMG-CSV-PG-02`.
Exact local image fingerprints and scan-file mappings are retained in the private evidence registry,
not this document. These IDs refer to the assessed snapshots, not whichever image currently uses
the same local tag. Later builds must receive fresh identity/check records. Published upstream
base-image pins remain in the Dockerfiles for reproducible builds.

Unused global npm/npx was removed from the frontend runtime, eliminating four High findings under the global package-manager tree, not application dependencies. Both Debian-based images received `libpcre2-8-0 10.42-1+deb12u1`, eliminating the fixable High PCRE2 finding and additional lower-severity matches. The retained scans show no C/H match with a recorded distribution fix, but **Critical and High residuals remain**; absence of a recorded fix is not a safety verdict. See [frontend packaging](../frontend/Dockerfile), [database packaging](../postgres.Dockerfile), [Debian PCRE2 advisory](https://security-tracker.debian.org/tracker/CVE-2026-86145), and [brace-expansion maintainer advisory](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-rgw5-rvv9-x895).

No direct catalog HTTP-input path to the listed vulnerable native functions was demonstrated by the bounded review. Important distinctions remain:

- The observed 64-bit Perl build lacks the explicitly 32-bit prerequisite for one regex advisory. This does not resolve the other Perl matches. [Debian advisory](https://security-tracker.debian.org/tracker/CVE-2026-8376)
- Phase 1 does not process archives, SQLite files, user regex programs, LDAP or CMS/CMP messages. Native dependencies and operator tools still exist; lack of an app caller is not proof of image-wide unreachability.
- PostgreSQL was built with libxml support. Catalog queries store parameterized text/numeric data without XML casts, but a database principal or future XML feature may expose additional native-parser paths. Those residuals must not be dismissed as unused CLI packages. [Debian XML advisory](https://security-tracker.debian.org/tracker/CVE-2026-6653)
- Scanner severity sometimes differs materially from upstream severity and exact preconditions; for example the OpenSSL empty-ciphertext finding requires a specific `EVP_Cipher()` call sequence. Several affected-range/source details, including a separate PCRE2 High, remain unresolved rather than being declared false positives. [Primary OpenSSL advisory](https://openssl-library.org/news/secadv/20260825.txt)

The full private image/advisory matrix is retained outside the repository. These results support a qualified local-demo review, not a clean image bill or hosted-release approval. New XML/archive/regex/provider or native-library uses require a fresh security gate. Refresh image scans and primary advisories before hosted exposure; do not suppress residuals solely to obtain a zero count or change the database's OS/collation environment without compatibility verification.

## Remaining verification boundaries

- Native browser checks passed for the earlier pre-UTC CSV slice, as recorded in the runbook. They do
  not verify the revised owner/session/source/publication journey, post-stability original design or
  complete final packaged acceptance. Image results above apply only to their named snapshots.
- The specified revision needs fresh session/password/ownership, authorization replay/expiry,
  independent effect/reconciliation, operation-lock, lifecycle-guard and migration-upgrade checks.
  No current diagram, interface contract or historical scan establishes those controls in code.
- No provider, advertising account, third-party credential, live feed publication, multi-user authorization or large-catalog performance was tested.
- Origin checks and loopback bindings are appropriate boundaries for the current controlled demo. Hosted exposure requires the separate operator-access, TLS/origin, proxy-limit, resource and retention/reset/backup gate.
- Synthetic-input policy and sanitized logs reduce unnecessary data exposure; they do not provide automatic PII classification, host isolation, guaranteed deletion from backups, or a general compliance claim.
- Re-run relevant checks after code, dependency, configuration or deployment changes. Preserve source-reviewed, test-executed, runtime-observed and hosted-verified states separately.
