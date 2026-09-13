# Feature Specification: Demo Owner Catalog Workflow

**Feature**: 001-catalog-workflow | **Revision**: 2 | **Branch**: master (unchanged)
**Created**: 2026-09-12 | **Revised**: 2026-09-13

**Status**: Revised Phase 1 specification cross-reviewed under constitution 2.0.0. The earlier CSV
slice is implemented, but its evidence does not establish the owner/auth/connector/publication
journey below. T028 closes document review; expanded implementation and acceptance remain pending.
See [scope decisions](owner-journey-revision.md).

## Product context and actors

The full product retains catalog/feed operations, the future online website, creative production,
audience workflows and SaaS/agency functions. The Phase 1 workbench is one delivered slice, not the
whole product or a permanent visual/competitive positioning decision.

Phase 1's user is a genuinely authenticated demo workspace owner. That owner performs the catalog
operator and simulated publisher responsibilities. One pre-provisioned synthetic account/workspace
is enough; a label or anonymous fixed-workspace bypass is not authentication. Other operator
functions remain in the product model, but full designer/approver/agency/billing/support interfaces
and public registration are not required here. Different actors do not require different servers.

## Clarifications

### Session 2026-09-13

- Q: Should the complete demo-owner journey include publication to a backend mock Meta destination
  as well as CSV download? → A: Include mock publication plus CSV download.
- The user requires actual backend Go mock services, connected-source discovery/fetching, a complete
  demo-account/auth flow, and a post-FE/BE/DB-stabilization original UI/UX pass using the named design
  skills and relevant website/design references. Live integrations and creative rendering remain
  deferred. The exact bounded defaults in research and the revision record are lead decisions.

## User Scenarios & Testing

### User Story 1 — Complete the owner catalog journey (Priority: P1)

As the demo workspace owner, I can sign in, authorize a mock commerce source, discover its catalogs,
choose one and fetch/process it using the real rules pipeline. I can inspect the completed data,
download it and publish the same immutable output to an explicitly selected mock destination.
I understand which actions are simulated and can log out with my server session revoked.

**Independent test**: With a seeded owner and empty application/provider state, complete H1 through
the real SaaS, connector, processing, persistence and mock destination boundaries.

### User Story 2 — Return, change sources and recover safely (Priority: P2)

As the same owner, I can return to my workspace, choose another catalog/provider or upload,
retrieve past completed results, reconnect a source and understand failed or uncertain publication.
A retry cannot duplicate or reapply an obsolete effect, and restart does not erase stored results
or the mock destination's independently stored contents.

**Independent test**: Use H2 against persisted state; use controlled failures and negative owner
fixtures for S1/S2. Unit and integration assertions support these two happy/two sad groups rather
than inventing additional product journeys.

### Four acceptance groups

| ID | Complete journey | Required outcome |
|---|---|---|
| H1 — Owner to published catalog | Credential login → owned workspace → approved mock Shopify connection → discover/select catalog → fetch/decode/validate/two rules → preview → authorized mock Meta target → confirm replacement → publish/readback → CSV download → logout | Actual owner authority, meaningful discovery/selection, exact included rows/counts, independent mock receipt/current readback matching the immutable projection, identical CSV data, revoked session |
| H2 — Alternative sources and continuity | Sign in again → select the other Shopify catalog and generic-feed source → upload equivalent CSV → retrieve completed results → repeat the same publication request safely → restart the owned app → re-login if needed and perform fresh provider readback → disconnect/reconnect | Different catalogs produce distinguishable data; equivalent source product content produces equivalent output; results and separate provider effects survive restart; replay does not apply a second effect; reconnect retains connection identity and advances grant revision |
| S1 — Identity and authorization failure | Wrong credentials, expired/revoked session, foreign-resource selection, wrong/expired/replayed mock authorization attempt | Server rejects access before provider callbacks or unauthorized data changes; app-session expiry leads to login, while a provider-grant problem requires reconnect without logging out the owner |
| S2 — Processing and delivery failure | Denied/failed/incomplete source, malformed/over-limit input, empty publication, definite destination rejection, lost acknowledgment/crash, conflicting request ID or superseded retry | Truthful bounded errors; invalid source/input cannot produce completed output; valid CSV survives every publication outcome; definite no-effect failure preserves the prior destination; uncertain effects may have replaced it and must reconcile through independent readback, not invented success/failure or blind replay |

A second synthetic owner/workspace may exist only in negative integration fixtures; it is not an
additional delivered UI account or proof of a complete multi-tenant product.

### Edge cases and customer-visible states

- Authorized connection, completed import/run, ready CSV, acknowledged submission and verified
  mock publication are distinct states. No mock receipt is labeled real Meta acceptance or ad serving.
- Authorization denial/cancellation creates no active grant. Expired attempts cannot be consumed;
  consumed attempts cannot be replayed; a stale reconnect cannot replace a newer grant.
- A selected catalog must belong to the active authorized source. Partial fetch is a failure, not
  a complete empty source. Empty discovery and an invalid empty product input have different messages.
- Every input row is validated before exclusion. Valid all-excluded input succeeds with a header-only
  CSV but is blocked from publication as empty_publication.
- Prefix applies once to each original normalized input. A new run does not transform a prior
  stored output again. Original row order and exact decimal strings remain stable.
- Editing controls marks displayed output as using previous settings; it never changes that stored
  output, its CSV or a published revision. Starting a new attempt does not delete previous results.
- Switching away from file upload clears a no-longer-visible File selection. Form validation and
  server field errors remain associated with the correct accessible control.
- Logout/expiry blocks subsequent protected requests. Revoking a source stops future fetches;
  it does not erase already owned completed output. In-flight or already accepted effects are
  recorded honestly rather than claimed retracted by logout or disconnect.
- Application restart marks interrupted local processing failed, but interrupted publication unknown.
  Only fresh independent adapter evidence may settle whether its effect exists.
- Duplicate client action keys resolve to one immutable application intent; different content under
  the same key conflicts. Duplicate provider keys return their original receipt without reapplying.
- Unknown publication blocks a new intent for that target until reconciled. An older failed attempt
  cannot overwrite a newer intent. A new deliberate publication may explicitly select an older run.
- A historical receipt proves an earlier application of a revision; it does not claim that revision
  remains the current target after a later replacement.
- Application reset does not retract simulated provider effects. A separate explicit mock-state reset
  is required, with the application stopped and exact synthetic scope verified.

## Requirements

### Functional Requirements

- **FR-001**: Provide real credential login, current owner/session retrieval, server-side logout,
  absolute/idle expiry and protected navigation for one pre-provisioned synthetic owner account.
  Do not substitute a UI flag, global user or fixed workspace label for verified identity.
- **FR-002**: Resolve workspace membership and permissions on the server for every connection,
  catalog, processing run, download and publication. Reject foreign resources before adapter calls;
  browser-supplied identity, role, workspace or authorization headers do not establish authority.
- **FR-003**: Provide two working backend source adapter kinds: Shopify-like mock with at least two
  distinguishable catalogs and generic-feed mock with at least one. Keep CSV upload as a separate
  intake path, not as proof of connected-source behavior.
- **FR-004**: Support meaningful simulated source/destination authorization: start a bounded
  owner/workspace/provider/account/capability-bound attempt, approve/deny/cancel once, persist an
  active connection/grant, disconnect and reconnect safely. Label simulation, not real OAuth.
- **FR-005**: Discover catalogs under an active connection, validate the selected catalog's authority,
  fetch bounded raw input and preserve provider/catalog/format/revision/completeness provenance.
  Reject incomplete acquisition rather than treating it as successful empty input.
- **FR-006**: Decode the explicitly documented mock Shopify JSON shape through a real normalizer.
  Decode generic feed/upload as UTF-8 CSV with exactly sku,title,price,currency,availability headers
  in any order. Accept optional UTF-8 BOM and LF/CRLF; reject malformed or extra/missing/duplicate
  fields under the relevant schema. All paths converge before shared validation and transformation.
- **FR-007**: Require unique nonempty SKU per input run, nonempty title, exact nonnegative decimal
  price, three uppercase ASCII currency letters and in_stock/out_of_stock availability. Preserve
  raw control-character rejection before trimming; reject formula-leading text. Do not treat SKU
  as a globally unique identity across external stores/catalogs.
- **FR-008**: Apply only a literal title prefix and optional exclusion of unavailable products.
  Validate the whole input first, apply prefix once to original normalized titles, then exclude;
  retain source order and the exact immutable settings.
- **FR-009**: Show complete bounded output rows, input/included/excluded counts, captured rules and
  meaningful source/catalog provenance. Counts must reconcile; stale controls must be explicit.
- **FR-010**: Download exactly the completed stored projection with canonical column order, correct
  escaping, stable neutral filename and safe CSV response headers. Never recompute business rules
  in the browser or read mutable current controls when exporting.
- **FR-011**: Persist authenticated workspace-scoped run metadata, settings, normalized/transformed
  results and discoverable recent result metadata across app restart. Raw source bytes are transient.
  Authorized owners can return to prior results after re-login without losing their context.
- **FR-012**: Let the owner authorize a mock Meta-like destination, discover at least two target
  catalogs and explicitly confirm a full nonempty replacement from a completed run. Publication
  must bind the exact target and immutable output; zero included rows returns empty_publication.
- **FR-013**: Keep durable application publication intent/status separate from independently durable
  mock-provider receipts/effects. Mark published only after fresh adapter readback confirms the
  intended target/hash/count. Receipt/history and current destination contents remain distinct.
- **FR-014**: Enforce workspace-scoped client replay keys and stable server-generated provider
  idempotency keys. Same intent/key reuses its record; mismatched content conflicts. Prevent duplicate
  effects, old-key reapplication, concurrent unresolved target intents and superseded retries.
- **FR-015**: Represent pending, unknown, published and failed publication explicitly. Provide
  read/reconcile and eligible explicit retry operations; no automatic retry/queue or force-success
  endpoint. Every outcome preserves valid completed CSV. Only definite no-effect failure preserves
  the prior destination unchanged; uncertainty may already include a committed replacement and
  must be reconciled against actual independent state.
- **FR-016**: Bound input to 1 MiB and 1,000 products, JSON envelopes to 16 KiB, concurrent mutations
  to two and reads to four per process, with bounded acquisition/processing/read/cleanup deadlines.
  Bound sessions, authorization attempts, runs, publications and mock effects independently.
- **FR-017**: Maintain ordered checksummed ordinary PostgreSQL migrations, explicit seed/bootstrap,
  least-required runtime grants and operator-only confirmed reset operations. Preserve already
  applied migration bytes and verify both fresh initialization and upgrade from the prior slice.
- **FR-018**: Distinguish signed-out/expired application session from expired/revoked provider grant;
  distinguish source, validation, capacity, publication and transport/unknown failures. Provide
  actionable recovery without implying that an uncertain response means no durable effect.
- **FR-019**: Keep production-demo source/destination mocks in appropriate backend services
  behind narrow replaceable interfaces; real processing and
  publication orchestration remain outside the mocks. Fault callbacks are test composition, not
  public debug headers or a substitute browser interception.
- **FR-020**: Protect credentials and sessions with server password hashing, random opaque sessions,
  hashed token storage, bounded login work, narrow HttpOnly-cookie transport, secure TLS settings,
  no client-readable session token, exact-Origin/custom-header checks and safe no-store responses.
  Enforce authority on the server; hiding a UI action is not authorization.
- **FR-021**: After the functional FE/BE/DB stability gate, complete an original operator UI/UX pass:
  review the supplied Socioh references and suitable Behance/other workbench examples, record design
  reasoning, apply the required design skills and verify final interaction states. Do not copy a
  competitor's branding, assets, marketing copy or page layout, or infer new features from examples.
- **FR-022**: Provide a Dockerized local application with private backend/database connectivity,
  health checks and bounded resources. Prefer one active normal frontend; additional fault/native
  instances are short-lived verification environments, not actor-specific product deployments.
- **FR-023**: Keep documents and generated artifacts in the application repository free of PII,
  machine paths, credentials and private diagnostic content. Use synthetic catalogs; do not claim
  the application automatically detects all PII. Keep agent browser tooling/evidence outside app.
- **FR-024**: Avoid overlapping Go instances against this demo state. Startup recovery must preserve
  completed results, treat local processing interruption separately from uncertain provider effects,
  and allow explicit safe reconciliation after restart.

### Canonical product and bounded defaults

The exported product has five fields. SKU is ASCII, starts alphanumeric, permits alphanumeric,
dot, underscore and hyphen, and is at most 128 characters. Title is nonempty and at most 200 Unicode
characters after surrounding-whitespace normalization. A literal prefix is at most 64 Unicode
characters; the resulting title is at most 264. Control characters and formula-leading =,+,-,@
after whitespace are rejected in the relevant source/output text.

Price permits at most 14 integer and 4 fractional decimal digits, with no exponent, sign or float
conversion; canonical text removes unnecessary fractional zeros. Currency is exactly three
uppercase ASCII letters. Availability is in_stock or out_of_stock. Validation applies before
exclusion, including to unavailable rows. A header-only source is invalid.

Operational defaults, lifetime/capacity limits, mock fixture schemas and state transitions are
defined in [research](research.md), [data model](data-model.md), [API contract](contracts/catalog-api.md)
and [revision decisions](owner-journey-revision.md). These are bounded Phase 1 choices, not a claim
of production-provider compatibility or zero-change future migration.

### Out of Scope

Live commerce/ad APIs, live provider OAuth, real ad publication or spending, external identity
provider integration, public registration/password reset, full agency/billing/other-operator UIs,
creative rendering/editor delivery, audiences, broker/Redis/ClickHouse, persistent raw asset/CDN
infrastructure, and the full public marketing website are outside this implementation slice.
The future website and creative experience remain in product scope. Hosted release still requires
its separate operator/access/TLS/backup/resource decision and authorization.

## Success Criteria

- **SC-001**: H1 completes through real owner authentication, persisted connection discovery/fetch,
  real processing, exact CSV and independently verified mock publication, then server-side logout.
- **SC-002**: H2 proves actual catalog/provider diversity, CSV equivalence, immutable result history,
  connection lifecycle and fresh independent destination readback after owned application restart.
- **SC-003**: S1 rejects invalid/expired identity, foreign resources and invalid/replayed authorization
  before provider calls or unauthorized data changes; second-owner fixtures remain test-only.
- **SC-004**: S2 proves honest source/input/destination failures, no partial invalid catalog output,
  valid CSV preservation, independent uncertain-effect recovery and no duplicate/obsolete overwrite.
- **SC-005**: Fresh database setup and ordered upgrade both pass with unchanged prior migration
  checksum, real runtime-role restrictions and explicit independent reset boundaries.
- **SC-006**: Relevant Go race/integration/vet/property checks, BFF/session checks, production builds,
  dependency/image review and revised security assessment pass or retain explicit reviewed limits.
- **SC-007**: The functional FE/BE/DB stability gate precedes reference-informed original UI/UX
  refinement. Its design rationale and operator-state coverage are recorded, not inferred from a build.
- **SC-008**: An agent independently verifies the final owner H1/H2/S1/S2 in actual Brave, including
  keyboard/error focus, 375/768/1440 widths, actual 200% zoom, exact download and mock readback.
  All Playwright tooling, configuration and evidence remains outside application code/tests.
- **SC-009**: Local readiness is documented separately from hosted deployment. One normal local
  frontend remains at handoff; redundant owned test instances are stopped without deleting data.

## Evidence boundary

Existing CSV pipeline tests, four native browser checks and patched container/image observations
cover the prior narrower slice. They are reusable regression evidence, not acceptance of the
new account, connector, publication or final design requirements. Revised tasks must be verified
against their actual implementation before Phase 1 is marked complete.
