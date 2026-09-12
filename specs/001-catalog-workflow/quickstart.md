# Phase 1 verification and demonstration guide

Status: planned checks only. The application commands and source files referenced here must be
implemented by the task plan before they can run. No application scenario has passed yet.

## Preparation

1. Review the feature spec, lead-selected defaults and source-layout proposal.
2. Implement the toolchain/bootstrap, explicit PostgreSQL migrations and demo workspace seed.
3. Provide reproducible local/container commands in the implementation Makefile and runbook.
   Commands must use documented environment-variable names and synthetic configuration, never
   personal paths or embedded credentials. Use the surrounding workspace's persistent scratch area
   for private execution evidence.
4. Use one small canonical fixture, including in-stock and out-of-stock products. The sample source
   and upload test must use the same raw bytes. Failure callbacks are installed by the test harness,
   not a public administrative endpoint.

## Four acceptance scenarios

| ID | Procedure | Assertions | Verification surface |
|---|---|---|---|
| H1 | Choose sample; set `Demo: ` prefix; enable exclusion; process; inspect preview; download | Exact retained SKUs/titles/prices/currencies/availability/order; correct counts; decoded CSV equals preview | Real Go stages and PostgreSQL, then Next.js browser journey |
| H2 | Upload the same bytes/settings; process and download; restart and fetch the known completed result | Business output equals H1; restart retains committed result; new run metadata may differ | Actual upload/BFF/Go/DB path and restart check |
| S1 | Submit named invalid/over-limit fixture variants | Actionable bounded error; no completed output; export request rejected; invalid excluded rows cannot bypass validation | Go boundary assertions plus UI validation/error state |
| S2 | Inject a source callback error before CSV opens | Source failure category; parser/export success cannot occur; no completed rows; UI offers a deliberate new attempt | Go callback mock and UI error-state check; no live provider |

Within these scenarios, include assertions for stable rule application, all-filtered header-only
success, row/field/deadline/concurrency bounds, cancellation and prevention of false completion.
They support the four behaviors; do not create a separate large testing campaign for Phase 1.

## Content comparison

Decode the downloaded CSV with a CSV parser. Compare all five fields of each retained row with
server-authored preview rows, in order. Do not compare only HTTP status or a substring of output.
An injected unexpected dependency call should fail the test explicitly, following the inspected
mock pattern. A source error and an empty successful output are different outcomes.

Verify migration replay and run/result round trips using PostgreSQL rather than a different database.
Mock-only persistence tests do not prove SQL constraints, transactions or restart behavior.

## Container rehearsal

After the four scenarios pass at their appropriate boundaries, rehearse H1/H2/S1 with the packaged
Next.js, one Go process and PostgreSQL. S2 retains its Go callback-mock and UI-error assertion evidence;
do not claim production Compose injected the source failure or add a public failure switch. Verify private service connectivity, database
readiness, shutdown, limits and output retrieval. Record image/dependency versions and commands.
Do not publish raw logs, personal paths, credentials, or unsanitized browser artifacts.

## Hosted deployment gate

Deployment is a later task after Phase 1 functionality works. Confirm operator access restrictions,
TLS/origin configuration, request/deadline/admission limits, database retention/reset/backup,
secrets and resource settings before exposing the service. Verify the target runtime independently;
container packaging or local tests alone do not establish a successful deployment.

## Evidence record

For each scenario record input fixture identity, rule settings, expected/actual result, command or
procedure, environment/revision, timestamp and any limit. Mark acceptance only on actual evidence.
Keep implementation, tests, packaging and hosted deployment as separate completion states.
