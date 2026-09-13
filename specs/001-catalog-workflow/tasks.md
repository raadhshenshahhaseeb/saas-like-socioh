# Tasks: Demo Owner Catalog Workflow

**Feature**: 001-catalog-workflow | **Revision**: 2 | **Status**: revised work, not completed.
**Inputs**: [spec](spec.md), [plan](plan.md), [research](research.md), [data model](data-model.md),
[API](contracts/catalog-api.md), [provider ports](contracts/provider-ports.md),
[UI flows](contracts/ui-flow.md), [quickstart](quickstart.md), [execution](execution.md).

## Task identity and evidence

The prior CSV-only T001–T027 list was preserved in the outer specification snapshot before revision.
Current tasks continue from T028 so an old task/evidence reference cannot silently acquire a different
meaning. The old hosted T026/T027 gate is replaced by the explicit later-host tasks at the end here;
it was not completed. This is the sole active task list, not a second queue.

Existing parser, validator, rules, result persistence, runtime and test code are reusable foundation.
Extend/review them; do not rebuild that work from scratch. Old passes do not check a new task box.
Every implementation task includes a lead/worker Wayfinder + grill-with-docs preflight, source and
contract review, named file ownership, task-relevant full skill instructions and proportionate
red→green checks. Resolve bounded questions with the lead; ask the user only for a consequential
missing product/authority decision. The user has answered mock publication versus download-only.

Task work groups below are execution stages inside Product Phase 1, not Product Phases 2/3.
[P] permits parallel work only after stated dependencies and with disjoint writers. No automatic
commit, push, external account operation or deployment occurs at a task boundary.

## Stage 1: Revised agreement and shared contracts

- [x] T028 Complete the lead/subagent consistency and authority review of the revised feature documents in specs/001-catalog-workflow/; resolve gaps against constitution 2.0.0 and record the final review before new code (all FR/SC; no source changes in analysis).
- [ ] T029 Define shared principal, connection, snapshot and publication values plus consumer-owned ports in backend/internal/saas/service.go, backend/internal/connector/ports.go and backend/internal/catalog/model/product.go; preserve exact five-field output and source provenance (depends T028; FR-002, FR-005, FR-013, FR-019).
- [ ] T030 Pin and review the Argon2id dependency in backend/go.mod and backend/go.sum, retain verified Go/Node/Next/React pins, and record current compatibility/advisory evidence in docs/security.md (depends T028; FR-020, SC-006).

## Stage 2: Identity, persistence and transport foundation

- [ ] T031 Extend backend/migrations/migrations.go to ordered known-prefix/checksum verification and append the reviewed owner/connection/provenance/publication/mock schema migration in backend/migrations/; preserve migration 001 bytes and existing results; test fresh and upgrade paths (depends T029; FR-017, SC-005).
- [ ] T032 Implement password verification, hashed session lifecycle, owner membership policy and bounded login/session admission in backend/internal/saas/auth.go, sessions.go, policy.go and backend/internal/store/postgres/; write focused red→green credential/expiry/revocation/ownership tests (depends T029, T030, T031; FR-001, FR-002, FR-016, FR-020).
- [ ] T033 Add private owner bootstrap/configuration and operator-role separation in backend/internal/config/config.go, backend/cmd/app/main.go and backend/migrations/; provisioning is idempotent and never resets existing credentials implicitly (depends T031, T032; FR-001, FR-017, FR-020).
- [ ] T034 Add Go authentication/resource middleware and auth HTTP routes in backend/internal/httpapi/; authorize before protected body/domain/provider work, keep minimal health/login/logout exceptions explicit, and normalize public timestamps to UTC (depends T032, T033; FR-001, FR-002, FR-018, FR-020).
- [ ] T035 [P] Implement narrow same-origin session transport and endpoint-aware BFF handling in frontend/src/lib/server/auth-session.ts, catalog-proxy.ts and frontend/src/app/api/auth/; set/clear only the designated cookie, strip internal token JSON and ignore arbitrary browser credentials/workspace headers (depends T029, T030; FR-001, FR-002, FR-018, FR-020).

**Foundation gate:** Real auth/membership and ordered persistence are available; BFF session contracts
agree. A fixed workspace, cosmetic login, or frontend fixture is not sufficient. Pure provider/model
work may run against frozen ports, but integrated owner acceptance waits for this foundation.

## Stage 3: US1 — Owner connects, processes and publishes

- [ ] T036 [P] [US1] Implement replaceable Shopify-like and generic-feed provider services and their committed synthetic fixtures in backend/internal/connector/providers/shopifymock/ and feedmock/; support scoped authorization, discovery, at least two distinct Shopify catalogs and one feed, bounded raw fetch and explicit unsupported/fault behavior (depends T029, T034; FR-003, FR-004, FR-005, FR-019).
- [ ] T037 [P] [US1] Add strict bounded Shopify fixture decoding/normalization in backend/internal/catalog/parsing/shopify_json.go and extend backend/internal/catalog/pipeline/process.go to converge with the real CSV validator/rules; preserve source-item identity and test exact-money/control/duplicate/completeness behavior (depends T029, T034; FR-005 through FR-008, FR-016).
- [ ] T038 [US1] Implement durable attempts/connections and simulated consent/reconnect/revoke in backend/internal/connector/authorization.go and backend/internal/store/postgres/; enforce nonce/expiry/revision/ownership, bounded connection try-locks, no DB transaction across adapters and no duplicate grant issuance (depends T031, T034, T036; FR-002, FR-004, FR-016, FR-018).
- [ ] T039 [US1] Extend backend/internal/connector/manager.go and backend/internal/store/postgres/runs.go for authorized connection/catalog intake, upload, provenance and recent metadata; retain transactional immutable completion, whole-input validation and safe failure recording (depends T037, T038; FR-005 through FR-011, FR-015, FR-016).
- [ ] T040 [US1] Implement provider, attempt, connection, discovery and revised run routes in backend/internal/httpapi/ and matching BFF route files under frontend/src/app/api/; retire the old public sample endpoint/POST mode without losing readable historical runs (depends T035, T039; FR-001 through FR-011, FR-018, FR-019).
- [ ] T041 [P] [US1] Implement the independently durable mock Meta adapter and ledger in backend/internal/connector/providers/metamock/ and backend/internal/store/postgres/; verify target scope, canonical projection bytes/hash, receipt identity, duplicate-key no-reapply and independent reset/capacity (depends T029, T031, T034; FR-012, FR-013, FR-014, FR-019).
- [ ] T042 [US1] Implement publication intent persistence/orchestration in backend/internal/connector/publications.go and backend/internal/store/postgres/; require confirmed nonempty full replacement, app replay before admission, separate provider commit/readback and truthful pending/unknown/published/failed outcomes (depends T039, T041; FR-012 through FR-016).
- [ ] T043 [US1] Add scoped publication list/detail/create/reconcile/retry HTTP and BFF routes in backend/internal/httpapi/ and frontend/src/app/api/publications/; return endpoint-specific statuses and server-derived action eligibility (depends T035, T042; FR-002, FR-012 through FR-015, FR-018).
- [ ] T044 [US1] Wire real SaaS, provider registries, repositories, processing and publication through backend/cmd/app/bootstrap.go and backend/internal/app/app.go; hold the exclusive lifecycle guard within max-five pool, fail closed on its loss and distinguish processing/publication startup recovery (depends T034, T040, T043; FR-017, FR-019, FR-024).
- [ ] T045 [P] [US1] Implement functional credential entry and owned-workspace shell in frontend/src/app/login/page.tsx, frontend/src/app/page.tsx, frontend/src/components/owner-shell.tsx and frontend/src/lib/auth-client.ts; protect private state, restore safe locations and provide true logout/expiry behavior (depends T034, T035; FR-001, FR-002, FR-018, FR-020; UI-01/02).
- [ ] T046 [US1] Build functional source/destination connection, consent and catalog-selection views in frontend/src/components/source-connections.tsx and mock-consent.tsx using frontend/src/lib/connection-client.ts; show simulation and distinct session/grant failures with meaningful approve/deny/cancel/reconnect actions (depends T040, T045; FR-003 through FR-005, FR-018; UI-03/04).
- [ ] T047 [US1] Extend frontend/src/components/catalog-workflow.tsx and frontend/src/lib/catalog-client.ts for authorized provider/upload intake, captured provenance, recent runs, immutable preview/download and actionable field/result states; retain accessible file/prefix fixes (depends T039, T045, T046; FR-006 through FR-011, FR-018; UI-04/05).
- [ ] T048 [US1] Implement functional target confirmation, receipt/current-readback and recovery UI in frontend/src/components/publication-panel.tsx and frontend/src/lib/publication-client.ts; preserve valid CSV on publication failure, stable client replay keys and explicit simulated effect wording (depends T043, T047; FR-012 through FR-015, FR-018; UI-06).
- [ ] T049 [US1] Prove H1 with real Go auth, persisted source consent/discovery/fetch, shared pipeline and independent mock destination readback in backend/internal/httpapi/catalog_integration_test.go; verify exact rows/counts, CSV and logout with no browser interception (depends T044, T048; SC-001).

## Stage 4: US2 — Alternate sources, return and safe recovery

- [ ] T050 [P] [US2] Extend provider/pipeline tests beside backend/internal/connector/providers/ and backend/internal/catalog/pipeline/ for basic Shopify/feed/upload equivalence and distinct seasonal selection, including normalized provenance and immutable rule variations (depends T039, T049; FR-003, FR-005 through FR-011, SC-002).
- [ ] T051 [US2] Complete return/re-login/recent-result/publication restoration, source disconnect/reconnect and lost-consent recovery across frontend/src/components/owner-shell.tsx, source-connections.tsx and publication-panel.tsx; no background polling solely to keep sessions alive (depends T048, T049; FR-001, FR-004, FR-011, FR-018; UI-01 through UI-06).
- [ ] T052 [US2] Finish target serialization, crash-to-unknown recovery, fresh reconciliation, superseded retry and historical-versus-current observation rules in backend/internal/connector/publications.go and its repository/adapter tests; never hold app transactions across provider calls or automatically resubmit (depends T042, T044, T049; FR-013 through FR-015, FR-024).
- [ ] T053 [US2] Implement independently confirmed stopped-app application and mock-provider resets in backend/migrations/ and backend/cmd/app/main.go; retain identity/credentials, preserve mock effects on app reset and reject live-server/direct-CLI maintenance and overlapping Go startup (depends T033, T044, T052; FR-017, FR-024, SC-005).
- [ ] T054 [US2] Prove H2 and S2 with real PostgreSQL and private fault construction in backend/internal/httpapi/catalog_integration_test.go and backend/internal/connector/ tests: restart/readback, failure before/after effect, key conflict, old-key no-reapply, unknown target block, stale retry and valid-CSV preservation (depends T050, T051, T052, T053; SC-002, SC-004).
- [ ] T055 [P] [US2] Prove S1 using a second synthetic test-only owner/workspace in backend/internal/httpapi/ and backend/internal/saas/ tests; cover expiry/logout, foreign nested resources, nonce replay/stale approval and zero unauthorized provider callbacks (depends T038, T044, T049; FR-001, FR-002, FR-004, FR-020, SC-003).
- [ ] T056 [P] [US2] Expand frontend/src/lib/server/ tests for sanctioned cookie/bearer transport, token removal, endpoint statuses, Origin guards, cancellation, response bounds and public/protected page CSP coverage; keep browser tooling out of frontend/package.json (depends T035, T043, T049; FR-018, FR-020, FR-023, SC-006).

## Stage 5: FE/BE/DB stability gate

- [ ] T057 Wire revised private bootstrap/seed/configuration and single-normal-frontend lifecycle commands in scripts/dev.mjs, scripts/compose.mjs and Makefile; keep raw bootstrap password and migration credentials out of serving environments and browser tools outside app (depends T044, T053; FR-017, FR-020, FR-022, FR-023).
- [ ] T058 [P] Verify revised frontend/backend/postgres Dockerfiles and compose.yaml with separate migration/bootstrap operations, private connectivity, runtime grants, health/lifecycle guard, preserved volumes, hardening and bounded resources (depends T044, T053; FR-017, FR-022, FR-024).
- [ ] T059 Run and record the full revised Go race/integration/vet, relevant property tests, BFF/session tests, production build and dependency checks in docs/runbook.md and docs/security.md; fix in-scope defects before declaring the functional stack stable (depends T054, T055, T056, T057, T058; SC-001 through SC-006).
- [ ] T060 Independently review the wired owner/source/publication contracts against specs/001-catalog-workflow/ and record the FE/BE/DB stability checkpoint in docs/runbook.md; no missing functional UI-01–UI-06 behavior, unexplained migration drift or unresolved authority/effect boundary may pass this gate (depends T059; SC-007).

## Stage 6: Required original UI/UX refinement after stability

- [ ] T061 Research the supplied Socioh pages plus three to five relevant Behance/other operator-workbench examples after T060; retain reference captures privately and write sanitized, source-linked design rationale in docs/ui-design.md, distinguishing observed inspiration from copied assets/layout and unverified competitor UI (depends T060; FR-021, SC-007).
- [ ] T062 Run the inspected ui-ux-pro-max design-system workflow for the established owner brief, combine it with frontend-design and freshly fetched Vercel web-design-guidelines, and document original semantic tokens/layout/state decisions in docs/ui-design.md before implementation (depends T061; FR-021, SC-007).
- [ ] T063 Implement the original post-stability design across frontend/src/components/, frontend/src/app/login/page.tsx and frontend/src/app/globals.css; cover all owner/consent/catalog/result/publication states without changing domain behavior or adding the deferred full website/creative studio (depends T062; FR-018, FR-021; UI-01 through UI-06).
- [ ] T064 Review the revised UI against the applicable design guidance; fix field/focus/error/long-content/responsive/reduced-motion issues, measure the worst bounded data view, and rerun affected application tests/build in frontend/ (depends T063; FR-021, SC-007, SC-008).

The design pass is mandatory and ordered after functional stability. Reading a skill, using the
earlier tokens, or copying a competitor screenshot does not complete T061–T064. The future online
website and creative experience remain product scope; this gate improves the current owner UI.

## Stage 7: Independent browser, final security and local handoff

- [ ] T065 Independently verify final H1/H2/S1/S2 in actual Brave against the normally started app, following quickstart.md and recording only sanitized summaries in docs/runbook.md; prove exact downloads and fresh independent mock readback, keeping all executable browser tooling/configuration/evidence in the outer workspace's .local/ (depends T064; SC-001 through SC-004, SC-008).
- [ ] T066 Verify and visually inspect final 375/768/1440 layouts, actual 200% browser zoom, keyboard/consent/confirmation/error-focus behavior and bounded-table access in the same independent agent browser workflow; record findings/fixes in docs/ui-design.md and the runbook (depends T065; FR-021, SC-008).
- [ ] T067 Perform independent final auth/resource/adapter/publication security and code reviews plus fresh dependency/image/runtime checks; fix applicable findings, retest changes and record residual applicability/evidence limits in docs/security.md (depends T065, T066; FR-002, FR-014 through FR-024, SC-006).
- [ ] T068 Update README.md, docs/runbook.md, specs/001-catalog-workflow/checklists/requirements.md and outer context/source/evidence records; verify links, task/requirement coverage, app privacy and preserved raw handoffs; never copy private browser paths/tokens into app (depends T067; FR-023, SC-009).
- [ ] T069 Complete the local readiness gate with an independent review of tasks.md and final evidence; leave one normal frontend running, stop redundant owned verification instances without deleting data, and clearly distinguish implemented/tested local scope from future website/creative/other-actor work and hosted release (depends T068; SC-001 through SC-009).

## Stage 8: Later hosted-release gate

- [ ] T070 Agree target-host/operator access, TLS/origins, authenticated demo exposure, trusted proxies, limits, secrets, data retention/reset/backup, resource sizing and stop-before-start deployment policy in docs/runbook.md; obtain the separate hosted deployment instruction (depends T069; FR-022, FR-024, SC-009).
- [ ] T071 Under that later instruction, deploy the reviewed application and independently verify actual revision, migrations/bootstrap, exposure, complete owner journey and persistence on the target; record observed runtime evidence in docs/runbook.md (depends T070; FR-022, SC-009).

## Dependencies and delegation

T028–T035 establish the reviewed types, storage, identity and transport foundation. Pure provider
and normalization work can proceed in parallel after their stated prerequisites; T038/T039 integrate
sources. T041 can progress independently of source UI, while publication orchestration waits for
real completed results. Functional UI work consumes frozen DTOs; it does not invent backend mocks.

Assign one writer to migrations/shared models and one to composition. Backend source/provider,
SaaS/persistence and frontend work may be split across agents only with explicit file ownership and
stable interfaces. Share every contract correction with its consumers. Reassign a finished agent to
independent review or other ready work; do not duplicate active work.

No final design work before T060. No final Brave acceptance before T064. No local completion before
T069, and no hosted action before T070. Exactly two happy and two sad journey groups remain; focused
unit/integration/property and browser assertions establish their required boundaries.

## Requirement coverage

| Requirement | Primary tasks |
|---|---|
| FR-001 | T032–T035, T045, T049, T051, T055 |
| FR-002 | T029, T032, T034–T035, T038–T040, T043, T055, T067 |
| FR-003 | T036, T040, T046, T050 |
| FR-004 | T036, T038, T040, T046, T051, T055 |
| FR-005 | T029, T036–T040, T046, T050 |
| FR-006–FR-008 | T037, T039, T047, T050, T054 |
| FR-009–FR-011 | T039–T040, T047, T049–T051 |
| FR-012 | T041–T043, T048–T049 |
| FR-013–FR-015 | T041–T043, T048, T052, T054, T067 |
| FR-016 | T032, T037–T039, T041–T042, T059 |
| FR-017 | T031, T033, T053, T057–T058 |
| FR-018 | T034–T035, T040, T043, T045–T048, T051, T056, T063 |
| FR-019 | T029, T036, T041, T044 |
| FR-020 | T030, T032–T035, T055–T057, T067 |
| FR-021 | T061–T066 |
| FR-022 | T057–T058, T069–T071 |
| FR-023 | T035, T056–T058, T065, T068 |
| FR-024 | T044, T052–T053, T058, T067, T070 |
| SC-001–SC-004 | T049–T055, T059, T065, T069 |
| SC-005 | T031, T053, T059 |
| SC-006 | T030, T056, T058–T059, T067 |
| SC-007 | T060–T064 |
| SC-008 | T064–T066 |
| SC-009 | T068–T071 |

## Definition of complete

Finish the entire revised local journey and every required gate, not only a compiling service, an
old sample demo, a document checklist or successful HTTP status. Acceptance includes real auth and
ownership, working backend mock connections, actual decoding/processing, exact CSV and independent
mock publication/readback, truthful failure/recovery, original UI/UX refinement and observed Brave
flows. Keep residual security findings explicit and do not claim live-provider or hosted behavior
from a local mock. The later hosted tasks remain separately gated.
