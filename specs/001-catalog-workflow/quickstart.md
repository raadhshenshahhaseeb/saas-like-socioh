# Revised Phase 1 verification and demonstration guide

**Status: revised acceptance is unverified.** This guide specifies exactly two happy and two sad
owner journeys under [the current constitution](../../.specify/memory/constitution.md) and the
[governing owner-journey revision](owner-journey-revision.md). It does not claim that the revised
authentication, connected-source, publication or design workflow is implemented or has passed.
Earlier CSV-slice checks are historical evidence with the limits described below.

Use the [feature specification](spec.md), [API contract](contracts/catalog-api.md),
[provider ports and fixtures](contracts/provider-ports.md), [data model](data-model.md),
[implementation plan](plan.md), [UI flows](contracts/ui-flow.md) and
[tasks](tasks.md) together. Exact routes, payloads and provider ports belong in their governing
contracts; this guide describes the actor actions and evidence required to verify them.

## Preparation and required order

1. Lead and assigned workers complete the Wayfinder/grill-with-docs preflight for the feature and
   each task. Reconcile contracts, dependencies, ownership, selected skills and acceptance evidence
   before implementation; independent SpecKit analysis must cover the revised documents.
2. Establish ordinary PostgreSQL migrations, preserving applied migration 001 byte-for-byte. A
   privileged local bootstrap provisions one synthetic owner, workspace and owner membership.
   Existing credentials must not be reset by migration or restart. No public signup is required.
3. Implement real Go identity/session verification, current membership/resource authorization,
   Connector/domain processing and persistence. Next.js supplies the interface and narrow
   HttpOnly-cookie transport; it must not invent identity or authorize a workspace itself.
4. Wire two backend source kinds: bounded Shopify-like JSON with at least two distinct catalogs,
   and generic-feed CSV with at least one. CSV upload is another intake path. Provider-specific
   decoding/normalization and the shared five-field validator, two rules and exporter remain real.
   Add the mock Meta destination with at least two selectable targets and a separately durable
   provider effect/receipt ledger. Callback faults belong only in private test composition.
5. Pass the stack-stability gate using application unit/integration tests: contracts agree,
   migrations/bootstrap work, real Go/PostgreSQL owner checks and source-to-publication/readback
   behavior pass, and BFF session/transport behavior agrees. Isolate integration and browser-demo
   databases; coordinate their single migration/reset owner to avoid concurrent destructive setup.
6. After that gate, research Socioh and suitable Behance/other operator-workbench references and
   perform the original UI/UX refinement pass using ui-ux-pro-max, frontend-design and Vercel
   web-design guidance. Record inspected references and design reasoning; preserve behavior and
   develop original presentation without copying assets, branding, copy or page layouts.
7. Only then start the final application normally and independently walk H1/H2/S1/S2 in Brave,
   followed by the final packaged-runtime and applicable security/privacy checks. Application
   unit/integration test code remains in the codebase; every agent browser executable, dependency,
   configuration, profile and generated artifact stays in the outer workspace's `.local/`.

## Proposed operational interfaces

The following operations are **implementation requirements, not verified command syntax**. Their
exact commands must be wired and documented by the runtime/task owner before use. Existing commands
for the earlier CSV slice do not by themselves provision or verify the revised owner journey.

| Proposed operation | Required behavior before it is considered wired |
|---|---|
| Migrate and bootstrap | Verify the ordered known migration history; append pending versions; provision the synthetic owner/membership without exposing credentials or resetting an existing password. |
| Run application checks | Execute relevant real Go/PostgreSQL and BFF tests against isolated synthetic data; preserve raw input/credential privacy in evidence. |
| Start, stop and restart the normal application | Manage only verified owned processes/containers; preserve its database; report the running URL and runtime identity. Do not launch a browser or pass browser settings into the app. |
| Start a private fault composition | Temporarily replace only the selected backend provider boundary for the approved S2 observation; retain real Go auth/domain/BFF/PostgreSQL and no public fault toggle. Stop the owned fixture afterward. |
| Reset stopped application data | Retain owner, workspace, membership and credentials; revoke sessions and clear application attempts/connections/publications/runs. Preserve independent mock-provider effects. |
| Reset mock-provider state | Require a separate explicit guarded confirmation and clear only synthetic provider state. Application reset alone may leave a populated or full simulated destination. |

Prefer one active normal frontend. An exceptional fault composition is a short-lived verification
fixture, not another actor application. Obtain the runtime owner's reported address; browser tools
operate independently from that address. Hosted exposure remains a separate later instruction.

## Four acceptance scenarios

Scenario IDs below refer to this revision. They must not inherit passing status from the older
CSV-only H1/H2/S1/S2 records. Supporting variants remain within these four actor journeys.

### H1 — Owner connects a source and publishes the first demo output

Actor: the preseeded demo owner, initially signed out. Follow UI-01 through UI-06 as defined in the
[UI flows](contracts/ui-flow.md).

1. Log in through real Go credential/session verification, retrieve the current session, and enter
   the server-authorized owned workspace. Confirm that the displayed owner/context matches Go state.
2. Start Shopify-like mock connection authorization and approve its scoped attempt. Verify the
   durable connection, granted capability and simulation label. Discovery/fetch must establish
   usable catalog access; a consent response alone does not count as a working connection.
3. Discover at least two catalogs, select the first, and fetch its provider-shaped JSON. Execute
   the real decoder/normalizer, canonical validation and two rules. Confirm source/catalog and
   schema/snapshot provenance, exact rows, ordering and reconciled input/included/excluded counts.
4. Download the completed CSV and decode it independently. All five fields, exact decimal strings
   and row order must match the server-authored preview from the same immutable result/settings.
5. Connect the mock Meta destination through its scoped approval flow; discover at least two
   targets, select one and explicitly confirm full replacement with the nonempty completed result.
   Verify durable application intent, independent provider receipt and fresh adapter readback.
   Mark published only when target identity, output hash and count match the intended replacement.
6. Confirm that publication leaves the valid CSV downloadable. Log out and verify that protected
   session/workspace/connection/result/export/publication requests now require authentication.
   Previously downloaded local files are not revoked or deleted by logout.

Required evidence: real auth/membership and connection observations; decoded preview/export
equality; simulated receipt plus independently obtained target readback; and effective logout.
Nothing in the mock result claims real provider access, OAuth conformance or live advertising.

### H2 — Returning owner changes sources and retains exact results

Actor: the same owner returns; the first completed result/publication remains persisted.

1. Log in again and reopen the owned workspace and earlier result/publication through current Go
   membership checks and the bounded, scoped recovery lists. Select the seasonal Shopify catalog
   and verify genuinely different identity/data from the basic catalog;
   overlapping SKUs across catalogs must not conflate their independently processed inputs.
2. Connect the generic-feed provider, discover its catalog and fetch CSV through its adapter. Upload
   the same CSV bytes through the ordinary file picker. Compare the basic Shopify, basic generic-feed
   and uploaded fixtures: their canonical/output values must agree for the same settings while
   retaining distinct source provenance. Seasonal data is the different-catalog control, not an
   equivalent fixture. JSON and CSV raw bytes need not match.
3. Deliberately process changed literal prefixes, then empty prefix/exclusion off. Verify new runs
   use original normalized input and leave prior completed output unchanged. A valid all-excluded
   result must retain a successful header-only CSV but block publication as `empty_publication`,
   without a provider effect or damage to the last good destination.
4. Publish a selected nonempty result to the other explicitly selected mock target. Repeat the exact
   application `request_id`: it must reuse the bound intent and original provider receipt without
   another effect. The server publication UUID, not the client replay key, is the provider
   idempotency key. New deliberate actions receive their own immutable intent.
5. Log out/re-login and request a controlled restart of only the owned normal application while
   preserving PostgreSQL. Reopen the known result/publication and compare exact CSV/settings/source
   identity. Perform a fresh adapter readback from the separately persisted mock-provider ledger;
   rereading the application's expected result or publication row is insufficient.
6. Disconnect and reconnect an owned source with a new scoped attempt. Fetching while disconnected
   must fail. Reconnection retains the connection identity and advances the grant revision without
   changing historical completed results or their source identity.
7. In a controlled lost-response variant, let attempt creation commit but lose its response, leaving
   the owner without an attempt ID or nonce. Recover through `GET /api/connection-attempts`: its
   bounded, newest-first owned metadata must expose an unexpired pending attempt for inspection and
   cancellation/restart, or identify an already-approved connection for inspection. An effectively
   expired attempt permits a fresh attempt without a cancel-first step. Recovery must not reconstruct
   the original nonce or permit approval without it. Exercise the loss in the private
   application test fixture, not through browser network interception.

Required evidence: actual source diversity and normalization/equivalence; immutable results; replay
without duplicate effects; controlled process restart and fresh readback; durable reconnect behavior.

### S1 — Authentication or ownership denial stops work before the adapter

Use real Go sessions/membership and PostgreSQL. A second synthetic owner/workspace is permitted only
as a negative integration fixture, not an additional demo account, UI role or public actor surface.

- Incorrect credentials, absent/expired session and replay after logout cannot operate protected
  resources. Enforce session/login bounds. Origin and a static request header are not authentication.
- Owner A cannot address the other fixture's workspace, connection, catalog, run, export or target.
  Ignore forged principal/workspace/provider headers; verify current authority before any adapter
  discovery, fetch or publication call. Assert no leaked resource details or unauthorized mutation.
  A source read grant cannot authorize destination writes; provider roles and current capabilities
  must match the requested operation.
- Denied, cancelled, expired, wrong-scope or already-used authorization attempts cannot create or
  upgrade a connection. The state nonce is consumed once and is not recovered from URLs or storage;
  reloading an unexpired pending consent without its in-memory state requires cancellation/restart.
  The recovery list returns at most 100 safe attempt metadata records and no nonce, nonce hash,
  grant reference or credentials. It must exclude the other workspace's attempts, require current
  authentication, and grant no approval authority merely because an attempt ID is discoverable.
- At `now >= expires_at`, list and detail GETs must report a stored pending attempt as effectively
  `expired` without changing its stored status or inventing `decided_at`. Verify storage before/after
  the reads, refusal of approval, and admission of a fresh attempt without cancelling the expired one.
- Verify concurrent consumption accepts at most once, membership loss invalidates protected actions
  under the current policy, and application-session expiry remains distinct from provider-grant expiry.

Use fail-on-unexpected-call mocks and real database assertions to prove authorization precedes
provider work. Use the API contract's documented non-disclosing error/status behavior.

### S2 — Authorized failure preserves good output and honest publication state

Use the same authorized owner with a prior good completed result/destination observation. Private
backend fault fixtures exercise the following cases as supporting assertions of this one journey:

- Source authorization denial, missing/expired grant, discovery failure or incomplete fetch does
  not become connected access or an empty successful catalog. Offer the appropriate deliberate
  reconnect/new-attempt action without falsely expiring the application session.
- Malformed provider input, invalid CSV/canonical values or exceeded bounds rejects the processing
  attempt as a whole; that attempt has no completed export. Validate even products later excluded.
- Fail destination work before the provider call, and at declared adapter boundaries. Preserve the
  completed processing result and valid CSV in every case. Assert unchanged prior destination only
  for definite no-effect failures; a lost acknowledgment after commit may already have installed
  the intended replacement. Keep processing failure, definite publication failure and uncertainty separate.
- For otherwise authorized resources, reuse a `request_id` with mismatched run/target/hash: return
  409 without another effect. Admit at most one pending/unknown intent per connection/external-catalog
  target within the workspace; the two mock targets remain independent. An exact duplicate create
  request with the same request_id must return its existing intent without another Submit. An
  already-applied provider-key replay must not reapply. Separately, an eligible explicit retry of
  a definite not-applied latest intent may call Submit with its original provider key and produce
  the first effect. Lookup replay/receipt before rejecting retained-intent/effect capacity.
- Pause initial creation after pending commits but before Submit. Its operation lock must have been
  reserved before that pending row became visible. Exercise concurrent reconcile and retry within
  the shared admission bound: each returns 409 `publication_busy`, with zero Readback or extra Submit,
  no false absent/failed state and no target unlock. Both action flags are false while the operation
  is active. Check lock release on replay, error, cancellation and successful completion.
- A failed publication cannot reconcile: return 409 `publication_not_reconcilable` with no Readback
  or failure-cause mutation. In particular, a permanent rejection cannot become retryable absence.
  Only a definite retryable/not-applied failed latest intent with an active grant and free target
  may advertise retry; it must acquire its operation lock before the conditional return to pending.
  That explicit retry may create the first effect, while exact duplicate create never submits.
  Verify both flags are false for an inactive grant or active operation, and that idle
  pending/unknown/published records under an active grant permit reconciliation only. Direct requests
  must recheck the matrix rather than trust a previously returned eligibility flag.
- Interrupt an owned test process after the independent provider effect commits but before the
  application marks publication complete. After restart, pending becomes unknown. Only explicit
  reconciliation with fresh readback matching target/hash/count may resolve published; authoritative
  provider absence may resolve not-applied/failed. No automatic queue or force-success path is used.
- After a newer intent, retry an older failed intent: return `publication_superseded`. Lookup of an
  older successful provider key returns its original historical receipt and never reapplies its
  snapshot over the current target. Republishing an old run requires a new deliberate action.

Required evidence: typed safe failures, current stored state, adapter call/effect counts, separate
application/provider transactions, unchanged valid CSV, unchanged prior destination for definite
no-effect failures, and truthful readback of the actual state after uncertain/committed effects.
Application publication states are `pending`, `unknown`, `published` and `failed`;
`publication_superseded` is a rejected stale operation, not an extra success state.

## Proof boundaries and final browser review

Compare full decoded CSV rows rather than substrings or status codes alone. For publication, compare
the immutable intended output with the independent mock target's actual full replacement, receipt,
hash and count. Its digest covers the canonical ordered JSON projection defined by the provider-port
contract, not the CSV bytes. Test migration/transaction constraints, exact retries, reset separation and restart
durability with PostgreSQL. Never manufacture provider evidence from the app's expected output.
Distinguish modeled failpoints, actual adapter effects and actual process-crash/restart observations.

After the stack-stability and original UI/UX gates, the agent independently opens the normally
running application URL in Brave and walks the four final journeys. Keep browser operations outside
application test commands and environments. Never capture passwords, opaque sessions, authorization
state nonces, provider credentials or raw sensitive headers in commands, screenshots or traces.

Inspect actual screenshots and interactions at 375, 768 and 1440 pixels, keyboard reachability and
error focus, and actual 200% browser zoom. Confirm narrow-screen access to the full output and
publication state; record the observed zoom method/scale and restore only the owned window. Check
hydration/CSP and console errors, distinguishing expected denial/failure HTTP responses from
unexpected application faults. Preserve unrelated browser tabs and unowned runtime resources.

Repeat the applicable happy/input journeys against the final Docker application and prove fresh
mock readback after its controlled restart. Use a temporary private fault composition only where
the approved S2 scenario requires it; record its scope and have its owner stop it afterward. Final
packaging, dependency/image, privacy and runtime checks apply to the revised build, not an older image.

## Historical evidence and completion

The earlier CSV slice established parsing/rules, exact preview/export, selected PostgreSQL
transactions, sample/upload behavior and bounded failures under its stated conditions. Its native
browser observations had no real owner login, membership, connected-provider lifecycle or publication.
They cannot close any revised journey. The retired application browser harness failed before
navigation and provides no acceptance pass. Historical image triage does not certify new code.

For each revised journey record fixture identity, synthetic actor/workspace/source/target, settings
and immutable output identity, expected/actual outcome, redacted HTTP/provider evidence, assessed
revision/runtime, timestamp, inspected screenshots and remaining limits. Close tasks only on actual
evidence. Separate real app behavior, simulated provider effects, historical observations and plans.

**Completion requires observed revised H1/H2/S1/S2, the preceding UI/UX gate and final local runtime
checks. These are currently unverified.** Hosted deployment follows its separate later instruction
and exposure/ownership/backup gate; a local demo or simulated publication does not establish release.
