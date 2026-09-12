# Feature Specification: Bounded Catalog Workflow

**Feature Branch**: `master` (unchanged; feature identity is `001-catalog-workflow`)

**Created**: 2026-09-12

**Status**: Specification draft for implementation review; no application implementation or tests executed.

**Input**: Phase 1 user brief: demonstrate one complete catalog-processing workflow with CSV/sample
input, validation, title-prefix and unavailable-product exclusion rules, preview and CSV download.
The later product retains richer integration, creative, audience and operational scope.

## User Scenarios & Testing

### User Story 1 - Process a sample catalog (Priority: P1)

As a demo operator, I can select a built-in synthetic catalog, configure the two rules, process it,
inspect the result and download the transformed CSV. I can identify a failure without mistaking it
for an empty successful catalog.

**Why this priority**: It proves the complete workflow through the mock source and real processing.

**Independent Test**: Run the sample journey through the actual application, compare preview rows
and counts with decoded download contents, and verify the controlled source-failure behavior.

**Acceptance Scenarios**:

1. **H1 — Happy sample:** Given a valid synthetic catalog containing available and unavailable items,
   when the operator applies prefix `Demo: ` and enables exclusion, then each retained title has
   exactly one prefix, unavailable items are excluded, original row order is retained, the summary
   counts reconcile, and the downloaded CSV contains exactly the completed preview's output rows.
2. **S2 — Sad source failure:** Given a controlled source failure before usable input is obtained,
   when processing is requested, then the application reports a source failure, no completed output
   is produced, and download is unavailable. It does not report an empty successful catalog.

### User Story 2 - Process an uploaded catalog (Priority: P2)

As a demo operator, I can upload a catalog in the supported CSV contract and use the same controls,
validation, preview and download behavior as the sample path.

**Why this priority**: It demonstrates that the processing behavior works on supplied input as well
as the built-in source fixture.

**Independent Test**: Upload the sample's bytes with the same settings and compare business output
with H1, excluding run identifiers and timestamps. Reject invalid/over-limit input without export.

**Acceptance Scenarios**:

1. **H2 — Happy equivalent upload:** Given the same valid bytes and rule settings as H1, when uploaded
   and processed, then validation, included/excluded counts and decoded output equal the sample
   result. After restarting the application, a known completed result remains downloadable.
2. **S1 — Sad invalid input:** Given malformed CSV, a missing/duplicate required header, an invalid
   row, or an exceeded input limit, when submitted, then a bounded actionable error identifies the
   failure, the input does not partially succeed, and there is no completed downloadable output.
   Named fixture variants belong to this one negative scenario; they are not extra product journeys.

### Edge Cases

- A valid input whose rows are all excluded completes successfully with zero output rows and a
  header-only CSV. A header-only source with no input products is a validation failure.
- Empty prefix and exclusion disabled leave valid product values unchanged after documented basic
  normalization. Each processing request uses the original input; reprocessing cannot double-prefix
  a stored result accidentally.
- Changing a control after completion marks the displayed result as belonging to its previous
  settings. A new processing request is required; download never silently reflects unprocessed edits.
- Duplicate item identifiers, invalid prices or unavailable-state spellings fail the complete input.
- Preview, export and concurrent browser tabs refer to an immutable completed run; settings are not
  read from mutable global state at download time.
- Deadline/client cancellation does not create detached processing. If completion was committed
  before the connection was lost, the stored completed result remains valid; retry starts a new run.
- A busy system, database failure, unknown result or failed result returns an explicit failure, not
  an empty success. Unfinished runs from a previous process are marked interrupted on startup.

## Requirements

### Functional Requirements

- **FR-001**: Operators MUST be able to choose a synthetic sample or upload a supported CSV and see
  which source is selected. No arbitrary remote URL input or live provider authorization is offered.
- **FR-002**: Both input modes MUST pass raw CSV through the same authoritative parsing, validation,
  transformation and export behavior. A built-in sample must not bypass validation.
- **FR-003**: Input MUST use UTF-8 comma-separated CSV with exactly the required headers `sku`,
  `title`, `price`, `currency`, `availability`, in any order, with each header present once. A leading
  UTF-8 BOM and CRLF/LF line endings are accepted; additional formats/field mapping are deferred.
- **FR-004**: Each normalized product MUST have a unique nonempty SKU, nonempty title, nonnegative
  decimal price, three uppercase currency letters and availability `in_stock` or `out_of_stock`.
  Trim surrounding whitespace. Validate every input row before applying exclusion.
- **FR-005**: Operators MUST be able to configure only a literal title prefix and an exclude-unavailable
  switch. Apply prefix once to each original normalized title; omit unavailable rows when enabled;
  preserve retained row order. Store the exact settings with the result.
- **FR-006**: Completed results MUST show input, included and excluded counts and all output rows
  within the bounded input. Input count MUST equal included plus excluded count.
- **FR-007**: Download MUST serialize the same completed output shown in preview, with headers in
  the canonical order above, correct CSV escaping and a stable neutral filename. Values/counts
  MUST NOT be independently recomputed by the interface.
- **FR-008**: Invalid or over-limit input MUST fail as a whole with bounded row/field errors and no
  completed output. Source/system failures MUST remain distinct from validation failures.
- **FR-009**: Successful run metadata, immutable settings and normalized/transformed rows MUST persist
  across restart. Raw uploaded/sample file bytes are transient. A known completed result can be
  retrieved without a persistent raw-file/object-storage service.
- **FR-010**: Processing MUST enforce the input, field, deadline and concurrency limits below. Work
  stops on cancellation where completion has not already committed. There is no background queue,
  automatic retry, resumable job or multiple processing deployment in Phase 1.
- **FR-011**: A seeded demo workspace MUST scope each run and result. It is supplied by trusted
  application configuration, not by an arbitrary browser-provided tenant identifier. This is not
  full authentication, organization administration or demonstrated multi-tenant isolation.
- **FR-012**: The interface MUST distinguish ready, processing, completed, validation failure and
  source/system failure, and disable unavailable actions. A deliberate new run is the recovery
  action after failure; changing rules does not mutate completed output.
- **FR-013**: Sample mocks MUST be able to inject a source error for automated verification and MUST
  fail unexpected unconfigured calls. Runtime controls for arbitrary failure injection are not public.
- **FR-014**: Documents, fixtures, displayed errors and exports MUST exclude personal data and secrets.
  Display product text as data. Reject control characters and spreadsheet-formula-leading text in
  SKU/title fields and the resulting prefixed title before marking a run successful.
- **FR-015**: Packaging MUST permit the selected frontend, backend and relational database to run
  together as one reproducible containerized application with private backend/database access. Actual hosted deployment
  follows separate completion and exposure checks; it is not completed by producing the package.

### Key Entities

- **Demo workspace:** stable synthetic owner context for this phase's runs.
- **Source descriptor:** a selectable built-in sample or uploaded input, with synthetic metadata.
- **Normalized product:** the five canonical fields plus original row position.
- **Rule settings:** literal title prefix and exclude-unavailable boolean captured for one run.
- **Processing run:** source kind, owner, settings, status, counts, timestamps and bounded failure detail.
- **Result item:** original normalized values, transformed values and inclusion decision belonging to
  one run. Completed result items are immutable.

## Success Criteria

### Measurable Outcomes

- **SC-001**: H1 and H2 produce identical business output for identical input and settings.
- **SC-002**: Every completed download decodes to the preview's exact output values and row order;
  summary counts reconcile, including the zero-retained-row case.
- **SC-003**: S1 and S2 produce zero completed exports, identify the failure category, and allow a
  deliberate corrected/new attempt.
- **SC-004**: Oversized and excess-row inputs are rejected at the specified boundary; processing
  stops at the configured deadline and additional concurrent work is rejected predictably.
- **SC-005**: The two happy and two sad acceptance scenarios pass through appropriate application
  and dependency-boundary checks, with evidence saved before any delivery claim.
- **SC-006**: The same workflow can be rehearsed in the packaged application. Hosted deployment is
  reported only after the separate target-host gate and runtime verification.

## Assumptions

These operational defaults were selected by the lead under the user's delegated specification
workflow; they are not claimed as values supplied by the user. They remain reviewable before coding:

- Maximum file payload: 1 MiB; maximum 1,000 product rows; maximum 30 seconds processing; two
  admitted runs. Reject excess concurrency immediately rather than queueing it.
- Maximum SKU length 128 characters, input title 200, prefix 64, output title 264; cap errors at 100.
  SKU begins with an ASCII letter/digit and contains only letters, digits, `.`, `_`, `-`. Title/prefix
  cannot contain control characters; a final title whose first non-whitespace character is `=`, `+`,
  `-` or `@` is rejected.
- Price supports up to 14 integer and four fractional digits; normalize decimals without floating
  point and without currency conversion. Currency spelling is syntactic, not a pricing/locale policy.
- Empty prefix is valid; exclusion defaults off. CSV output uses LF and RFC-style quoting.
- One controlled demo operator/workspace is sufficient. Persisted rows are synthetic/non-personal.
  There is no run-history screen, multi-user access model or real provider account in this phase.
- Optional fixed creative preview is deferred until this catalog workflow is accepted; it is not
  required for completing this feature.

See [research.md](research.md) for provenance and lead answers, [plan.md](plan.md) for technical
responsibility and proposed source layout, and [quickstart.md](quickstart.md) for the planned checks.
