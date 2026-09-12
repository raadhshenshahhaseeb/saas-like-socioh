# Tasks: Bounded Catalog Workflow

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [API contract](contracts/catalog-api.md), [quickstart.md](quickstart.md).

**Status**: All implementation tasks pending. No application code or tests have run.
Task phases below are implementation work groups within Product Phase 1, not Product Phases 2/3.

## Format and ownership

Use `- [ ] TNNN [P] [USn] description with path`. `[P]` means the task can run alongside another
ready task touching different files, only after its named prerequisites are complete. One writer
per file. The lead answers bounded questions using the specification and records changes; it does
not invent user approval for scope/structure changes. Keep this as the sole implementation task list.

## Phase 1: Setup

- [ ] T001 Review the proposed source tree and lead defaults in `specs/001-catalog-workflow/plan.md` and `research.md`; record owner approval before creating the application source layout.
- [ ] T002 Pin compatible supported Go/Node/Next.js/React/TypeScript and database-driver versions, create `backend/go.mod`, `frontend/package.json` and lockfiles, and document reproducible setup in `docs/runbook.md` (depends T001).

## Phase 2: Foundation

- [ ] T003 [P] Implement isolated typed app/database configuration with validation and processing bounds in `backend/internal/config/config.go` (depends T002; FR-010, FR-014).
- [ ] T004 [P] Define canonical products, settings, issues and result values in `backend/internal/catalog/model/product.go` using exact decimal semantics (depends T002; FR-003 through FR-008).
- [ ] T005 [P] Establish transport response/error types from `contracts/catalog-api.md` in `backend/internal/httpapi/catalog.go` without implementing business rules (depends T002; FR-008, FR-012).
- [ ] T006 [P] Write timestamped ordinary PostgreSQL schema/up/down migrations and demo-workspace seed in `backend/migrations/`; declare scoped constraints/indexes and runtime-role privileges (depends T002; FR-009, FR-011).
- [ ] T007 Implement workspace-scoped run/result persistence, transactional completion and conditional failure updates in `backend/internal/store/postgres/runs.go`; verify migration replay and completed-result round trips on PostgreSQL (depends T004, T006; FR-009, FR-010, FR-011).
- [ ] T008 Implement the seeded workspace resolver in `backend/internal/saas/service.go`; accept no arbitrary browser tenant selection (depends T007; FR-011).
- [ ] T009 Define source discovery/open contracts and callback-configured mock in `backend/internal/connector/source/source.go` and `mock/source.go`; return raw CSV and fail unconfigured calls explicitly (depends T004; FR-001, FR-002, FR-013).

**Checkpoint**: Frozen types/contracts, configuration, persistence and source/actor dependencies are
ready. No live provider, full authorization platform or queue is part of this foundation.

## Phase 3: User Story 1 — Sample workflow

**Goal**: Complete H1 and expose S2 through real processing behind the mock source.
**Independent test**: Sample → rules → server preview → decoded CSV, plus injected source failure.

- [ ] T010 [US1] Write failing H1/S2 service assertions in `backend/internal/connector/manager_test.go`; assert exact content/counts and forbid completed output when the source fails (depends T003 through T009).
- [ ] T011 [US1] Implement bounded CSV parsing, validation, title-prefix/exclusion and deterministic CSV serialization in `backend/internal/catalog/parsing/csv.go`, `validation/validate.go`, `transformation/rules.go`, `pipeline/process.go`, and `export/csv.go` (depends T010; FR-002 through FR-008, FR-014).
- [ ] T012 [US1] Implement Connector Manager run orchestration, rule validation before run insertion, admission/deadline/cancellation handling, successful persistence and stored preview/export in `backend/internal/connector/manager.go` (depends T011; FR-001, FR-008 through FR-013).
- [ ] T013 [US1] Implement the Go sample/run/result/export HTTP routes and safe errors in `backend/internal/httpapi/catalog.go` and `router.go` (depends T012; FR-001, FR-006 through FR-014).
- [ ] T014 [US1] Compose dependencies and server lifecycle in `backend/cmd/app/main.go` and `bootstrap.go`; close partial startup resources, fail database readiness and mark previous processing runs interrupted (depends T013; FR-009, FR-010).
- [ ] T015 [P] [US1] Build sample selection, rule controls, processing/error states and bounded result preview in `frontend/src/components/catalog-workflow.tsx` and `frontend/src/app/page.tsx` against the frozen server contract (depends T005, T009; may run alongside T010 through T014; FR-001, FR-005, FR-006, FR-012).
- [ ] T016 [US1] Implement private Go forwarding, request limits, cancellation and response preservation in `frontend/src/lib/catalog-client.ts` and the sample/run/result/export route files listed in `plan.md` (depends T013, T015; FR-002, FR-007, FR-008, FR-010, FR-011).
- [ ] T017 [US1] Execute H1 and S2 assertions at the Go boundary and connect the sample browser journey in `tests/e2e/catalog-workflow.spec.ts`; record observed content and failure behavior (depends T014, T016; SC-002, SC-003, SC-005).

## Phase 4: User Story 2 — Upload workflow

**Goal**: H2 reproduces the same business output through upload; S1 rejects malformed/over-limit input.
**Independent test**: Upload canonical sample bytes/settings and compare decoded output to H1.

- [ ] T018 [US2] Write failing H2/S1 request/service assertions in `backend/internal/httpapi/catalog_test.go`, including no completed export on invalid input (depends T017; FR-003, FR-004, FR-008, FR-010, FR-014).
- [ ] T019 [US2] Implement bounded uploaded-file acquisition in `backend/internal/connector/source/upload.go` and wire it into `backend/internal/httpapi/catalog.go`, converging before the same real parser (depends T018; FR-001, FR-002, FR-003, FR-010).
- [ ] T020 [US2] Add upload selection, validation display and stale-settings/result behavior in `frontend/src/components/catalog-workflow.tsx` and its run route; preserve exact server output (depends T019; FR-001, FR-005 through FR-008, FR-012).
- [ ] T021 [US2] Execute H2/S1 through the actual BFF/Go/PostgreSQL path and verify known-result restart retrieval in `tests/e2e/catalog-workflow.spec.ts`; finish the four-scenario evidence record (depends T020; SC-001 through SC-005).

## Phase 5: Packaging and cross-cutting checks

- [ ] T022 [P] Add frontend/backend Dockerfiles and `compose.yaml` with one Go service, PostgreSQL and frontend ingress; keep database/backend private and credentials external (depends T021; FR-015).
- [ ] T023 [P] Add reproducible setup/migrate/run/check commands to `Makefile` and a sanitized operating guide in `docs/runbook.md`; preserve persistent scratch conventions (depends T021; FR-009, FR-014, FR-015).
- [ ] T024 Check implemented limits, cancellation, decimal handling, safe CSV/text output and source-failure behavior against the same H1/H2/S1/S2 evidence in `docs/runbook.md`; fix gaps within this feature (depends T022, T023; FR-004, FR-008, FR-010, FR-014, SC-004, SC-005).
- [ ] T025 Rehearse H1/H2/S1 in the Docker application and carry S2's Go callback-mock plus UI-error assertions as its separate boundary evidence; record exact verification layers, versions and commands in `docs/runbook.md` without PII or local paths (depends T024; SC-006).

## Phase 6: Later target-host gate

- [ ] T026 Agree and record target-host operator access, TLS/origins, request limits, database retention/reset/backup, secrets and resource settings in `docs/runbook.md`; obtain the later deployment instruction before external changes (depends T025; FR-015, SC-006).
- [ ] T027 Under that later authorized deployment task, deploy the reviewed Docker application and verify the workflow on the target runtime; record runtime evidence in `docs/runbook.md` (depends T026; FR-015, SC-006).

## Dependencies and parallel work

T001 → T002 → foundation → US1 → US2 → packaging → deployment gate. T003/T004/T005/T006 may
run independently after T002. T007 needs T004/T006; T008 needs T007; T009 needs T004. T010 waits
for all foundation dependencies. T015 can run with the Go implementation because its contract is
already fixed, but T016 integrates only after Go HTTP behavior exists. T022/T023 own different files.

The source and UI writers must not edit shared contract documents concurrently. Questions go to the
lead, which updates the governing contract and informs affected agents. Reassign finished agents to
ready work where their retained context is useful. Review/validation is independent of authorship
where practical; statuses remain unchecked until work and evidence exist.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T009, T012, T013, T015, T019, T020 |
| FR-002 | T009, T011, T016, T019 |
| FR-003 | T004, T011, T018, T019 |
| FR-004 | T004, T011, T018, T024 |
| FR-005 | T004, T011, T015, T020 |
| FR-006 | T011, T013, T015, T020 |
| FR-007 | T011, T013, T016, T020 |
| FR-008 | T005, T010, T011, T013, T016, T018, T020 |
| FR-009 | T006, T007, T012, T014, T021, T023 |
| FR-010 | T003, T007, T012, T013, T014, T016, T018, T019, T024 |
| FR-011 | T006, T007, T008, T012, T013, T016 |
| FR-012 | T005, T012, T013, T015, T020 |
| FR-013 | T009, T010, T012, T013 |
| FR-014 | T003, T011, T013, T018, T023, T024, T025 |
| FR-015 | T022, T023, T026, T027 |

## Implementation strategy

Complete one real sample path first, then the equivalent upload path. Keep the two happy and two
sad scenarios as the acceptance envelope; supporting assertions are not new product scope. Preserve
the future phase ledger without adding unused implementation modules. No automatic commit or deploy
occurs at a task boundary. Source-layout approval and the later hosted-access gate are explicit.
