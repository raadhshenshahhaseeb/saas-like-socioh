# Owner journey UI contract

**Feature**: `001-catalog-workflow`, revision 2 | **Date**: 2026-09-13
**Status**: Required behavior for the revised owner journey; implementation and final design are
pending their own evidence. This is not a claim that the earlier data workbench supplies these flows.

Read with [spec.md](../spec.md), [owner-journey-revision.md](../owner-journey-revision.md),
[HTTP contracts](catalog-api.md), [provider ports](provider-ports.md), and [plan.md](../plan.md).
The API contract owns exact DTOs, statuses, cookie settings and numeric limits. This file owns their
operator-facing meaning. UI-01 through UI-06 are stable flow identifiers for [quickstart](../quickstart.md).

## Product and actor frame

One pre-provisioned synthetic owner signs in to a real account/session and owned workspace. The
owner performs source administration, catalog operation and simulated publication in this phase.
There is no public registration, password reset, invitation system or implemented designer/agency/
billing/support UI. The default login identifier is `demo-owner`; credentials are provisioned through
the private operator bootstrap, not hardcoded or prefilled in the frontend.

The owner uses one application URL. Login and workspace views reflect session and resource authority,
not a choice of localhost port. Normal, fault-composed and packaged runtimes are verification contexts.
Provider connections and database service roles are also distinct from business-user roles.

The future online website and creative experience remain required product direction. Phase 1's
functional owner dashboard and its later original-design pass are not the final product's permanent
identity or differentiation. Public design references do not change the established workflow.

## Shared interaction rules

- Render Go-returned owner, workspace, permissions, connection state, product data and publication
  state. UI visibility is a convenience; Go enforces session, membership and resource authority.
- All browser requests remain same-origin. The BFF reads only `catalog_session` server-side and
  constructs the fixed Go authorization header. No token is returned to client JSON, JavaScript
  storage or URLs. Never forward arbitrary browser authorization/workspace/provider headers.
- Use exact configured Origin plus `X-Catalog-Request: 1` for every mutation, including login and
  logout. Retain bounded requests, admission, cancellation, safe errors and no-store responses.
- Treat `401` application-session failure as a login boundary. Treat
  `connection_reconnect_required` as a provider connection boundary; it does not log the owner out.
- Keep selected source/catalog, captured processing settings, immutable result, destination target,
  publication attempt and current target observation distinguishable. Editing a control changes none
  of the already stored records or provider effects.
- Do not expose secrets, provider grants, authorization-attempt nonce values, original filenames or
  raw dependency errors in copy, logs, screenshots or downloadable evidence. Use synthetic data.
- Use loading, empty, denied, invalid, failed and uncertain states deliberately. A timeout is not
  evidence that nothing was saved or applied. Do not automatically retry a mutation.
- Request-body and business limits are canonical in the API/provider contracts: 1 MiB/1,000 products,
  exact decimal handling, the two rules, bounded issue details and immutable output remain in force.

## UI-01: Login, session restoration and logout

**Entry:** signed-out user opens the application, a saved-result link, or the login view.

1. Determine the current session through `GET /api/auth/session`. While unresolved, show a bounded
   account-loading state; protected workspace data/actions are not presented as authorized.
2. A signed-out/expired response leads to credential entry. Label the account as the provisioned demo
   owner; do not offer a fabricated sign-up path or silently authenticate a global user.
3. Collect login identifier and password and call `POST /api/auth/login`. The identifier contract is
   exact ASCII, 3–64 characters; password is exactly 16–128 valid UTF-8 bytes. Do not trim, normalize,
   prefill, log, or persist the password in client storage. Go verifies the credential.
4. On successful cookie/session establishment, display the server-returned owner/workspace context.
   Resume only a validated same-origin product location; a saved run still needs ownership checks.
5. **Log out** calls `POST /api/auth/logout`, cancels outstanding client work and clears sensitive
   local view/attempt state. Successful logout revokes the server session, clears the application
   cookie and returns to login. A failed/ambiguous response must not claim server revocation.

**States:** checking session; signed out; signing in; authenticated owner; invalid credentials;
login throttled; account service unavailable; session expired/revoked; logging out; logout outcome
unconfirmed. Wrong credentials use a safe explanation rather than account enumeration details.

**Lifetimes:** Go enforces eight-hour absolute and thirty-minute idle expiry, at most ten active
owner sessions, bounded hash admissions and login rate. A UI timer is advisory; background polling
must not manufacture activity merely to keep the owner logged in.

**Recovery:** expired application access leads to a fresh login. Clear cached private results and
abort pending requests on logout/expiry. Already committed results and mock effects remain owned
records; after login the owner can retrieve them and reconcile uncertainty. Logging out does not
claim to retract a publication.

**Acceptance:** FR-001, FR-002, FR-018, FR-020; H1/H2 and S1.

## UI-02: Owned workspace and return context

**Entry:** Go has established the owner session and membership.

The shell shows the active workspace and owner context, connected sources/destinations and their
status, catalog work, recent results/publications, and logout. These are functions within the same
application, not separate owner/designer/admin servers.

- Use `GET /api/providers` for the supported simulated registry and `GET /api/connections` for owned
  connection state. Label source and destination roles. Do not invent a connection from a selected tile.
- `GET /api/connection-attempts` returns `{attempts: [...]}` with safe owned metadata, newest first,
  at most 100 records and no query parameters or nonce. Use it to locate pending or completed consent
  after reload or a lost creation response; follow UI-03 rather than assuming no attempt exists.
- `GET /api/catalog/runs` and `GET /api/publications` supply recent workspace-scoped metadata lists,
  newest first, at most 100 each. Lists do not include all product projections. Selecting a row loads
  its detail under the authenticated workspace.
- A known-result link may continue using `?run=<UUID>` after authentication. Treat query values as
  untrusted identifiers. A missing or foreign result is not disclosed as another owner's resource.
- Empty workspace, no sources, no results and no publications are distinct useful states with actions
  that lead to the relevant flow. An unavailable list is not an empty successful workspace.

**Loading order:** finish the session check before protected bootstrap reads. Prioritize provider,
connection and attempt metadata, then schedule history and selected-detail reads as slots become
available. Keep the page's total concurrent reads at or below the shared four-GET admission limit,
including navigation/detail requests; do not launch all bootstrap lists together. Concurrent tabs
can still exhaust server admission: preserve loaded sections and offer a deliberate read retry on
`429`, rather than treating it as an empty list or making throttling normal startup behavior.

The UI does not expose an arbitrary workspace-ID field. Future membership/role expansion belongs at
the server-resolved actor boundary; this phase's one-owner presentation is not full multi-operator UI.

**Acceptance:** FR-002, FR-011, FR-018; H1/H2 and S1.

## UI-03: Simulated connection consent and lifecycle

**Entry:** the owner selects a supported provider and its configured external demo account.

The source registry includes `shopify-mock` and `feed-mock`; the destination registry includes
`meta-mock`. Provider/account/catalog labels come from the backend. Every relevant card and consent
surface makes the simulation visible without implying live account access or real OAuth compliance.

1. **Connect** calls `POST /api/connection-attempts` with the registry selection defined in the API.
   Show the initiating owner/workspace, provider, external account, requested catalog capability,
   five-minute expiry and the simulated nature of approval before the decision.
2. Offer explicit **Approve**, **Deny** and **Cancel**. Approve/deny call
   `POST /api/connection-attempts/{id}/decision`; cancellation calls its `/cancel` action. Pass the
   creation-time state nonce only in the required decision request, from component memory.
3. Show `pending`, `approved`, `denied`, `cancelled` or `expired` from the server. Only confirmed
   approval creates or advances an active connection/grant. An initial pending attempt has a null
   connection ID; render the server-returned ID only after successful approval. Denial/cancellation
   cannot show connected.
4. After approval, retrieve the connection and move to source or destination catalog discovery.
   Read `GET /api/connection-attempts/{id}` after an ambiguous decision response. If the creation
   response was lost and no attempt ID is known, discover it through the owned attempt list first.
5. **Disconnect** calls `POST /api/connections/{id}/disconnect`. **Reconnect** calls its `/reconnect`
   action and completes a new consent attempt. Reconnect retains the connection ID and advances grant
   revision; it cannot silently replace a newer grant with a stale approval.

**Nonce/reload rule:** the nonce is returned once when the attempt is created. Do not put it in a URL,
storage, a log or a display. After reload or a lost creation response, list attempts and inspect the
matching provider/account attempt. Neither list nor detail can retrieve the nonce. For a pending
attempt whose nonce is lost, offer **Cancel** and then a deliberate new **Connect** or **Reconnect**
after cancellation is confirmed. An `authorization_pending` response uses the same discovery path;
it does not leave the owner blocked behind an unknown attempt ID. An already approved attempt leads
to its recorded connection, not another approval request. Other terminal states allow a deliberate
fresh attempt within the existing bounds.

**Expired consent:** list/detail responses expose effective `expired` once a pending attempt's
expiry has passed, without a GET-side mutation or an invented decision timestamp. Display that
server state and offer a deliberate fresh attempt directly; an expired attempt needs neither its
lost nonce nor cancellation first. A displayed countdown does not authorize an expired approval.

**Lifecycle contention:** `409 connection_busy` means another mutation for this workspace/provider
is running. Retain the current selection and known state, explain the conflict and offer deliberate
retry after inspecting current state; do not queue or automatically repeat consent/disconnect.
The backend revalidates authority, expiry and revision after authorization before committing a
grant. An expired, stale or unconfirmed approval cannot be presented as connected.

**States and bounds:** connections are `connected`, `reconnect_required` or `disconnected`. Grants
expire after one hour. The demo allows one connection per workspace/provider kind, one pending attempt
per provider kind and at most 100 retained attempts per workspace. Show capacity/expiry errors with
their supported recovery; do not create hidden duplicates or silently prune history.

**Data retention meaning:** disconnect blocks new calls seeking authority after revocation commits.
Already authorized in-flight calls may still complete, including effects not yet accepted at the
time of disconnect. It does not erase owned completed runs, valid CSV, past publication receipts or
provider effects, or promise immediate cancellation/rollback. Explain this before the action. A
provider grant problem offers reconnect while leaving the application session intact.

**Acceptance:** FR-003, FR-004, FR-018, FR-019; H1/H2 and S1/S2.

## UI-04: Catalog discovery, fetching and CSV intake

**Entry:** an authorized source connection or the authenticated upload path is selected.

1. `GET /api/connections/{id}/catalogs` lists that connection's catalogs. The Shopify-like mock must
   offer at least two distinguishable choices; the generic-feed mock offers at least one. Show source,
   external account, catalog identity/label and available metadata together so the owner knows what
   will be fetched. Source and destination catalog selectors are not interchangeable.
2. The owner selects a catalog and the literal title-prefix/exclude-unavailable controls. The
   provider action, such as **Fetch and process**, calls `POST /api/catalog/runs` with connection and
   catalog identity plus rules. It performs actual backend acquisition/decoding/processing.
3. The Shopify-like raw JSON normalizer and CSV parser remain backend responsibilities. The UI does
   not translate a mock payload into a completed product result. A provider schema error or incomplete
   snapshot yields a typed failure, not an empty valid catalog.
4. CSV upload remains a separate authenticated intake option through the same run endpoint's multipart
   contract. Switching away clears an invisible retained File selection. No original filename is
   copied into application labels, persisted metadata or evidence.
5. While the request runs, prevent duplicate submit and confusing selection changes. Label the known
   operation; do not invent percentage progress or unobserved backend stages. A deliberate new run
   clears the previous active result but does not delete it from recent results.

**States:** source not connected; discovery loading; discovered choices; no catalogs; catalog no longer
available; grant needs reconnect; source unavailable/incomplete; upload not selected/oversized;
processing; validation failed; capacity/deadline/transport outcome; completed result.

A discovery failure is not a session failure. A source catalog existing elsewhere does not make it
selectable here. Go verifies connection/catalog ownership and grant state before provider work.

The basic Shopify, basic feed and matching CSV fixture support an equivalence check. The seasonal
Shopify fixture proves catalog selection changes the data. These examples do not claim real provider
protocol support or that SKU is globally unique across catalogs.

**Acceptance:** FR-003, FR-005 through FR-009, FR-016, FR-018; H1/H2 and S1/S2.

## UI-05: Immutable result preview and CSV download

**Entry:** a completed run is returned or selected from the recent-results list.

- `GET /api/catalog/runs/{id}` supplies captured source/connection/catalog/schema/revision provenance,
  saved rules, counts, output projection and result state. Display enough of that context to identify
  the actual input and saved result; never relabel an old run with current source controls.
- Render the full bounded included output and input/included/excluded counts. Go supplies exact
  product strings, ordering and counts; the browser does not recalculate money or business rules.
- Edited controls produce an explicit previous-settings notice. Download and publication continue
  to refer to a deliberately selected immutable result, not unprocessed edits.
- **Download CSV** uses `GET /api/catalog/runs/{id}/export`. Preserve the current safe file behavior:
  canonical five-column output, real serializer, fixed neutral filename, and download failure shown
  without discarding the completed preview.
- Valid all-excluded input completes with zero output rows and a header-only CSV. Explain that there
  is no nonempty result to publish; keep CSV download available while publication is disabled.
- Invalid/incomplete processing has no completed output for that attempt. An uncertain response may
  follow a committed result, so use uncertainty-aware copy and recent-result lookup rather than
  declaring no stored output. A fetched confirmed failed run can be described as failed.

Publication rejection, uncertainty or destination disconnect does not invalidate this result or its
CSV. Application login/ownership is still required to read it after session expiry or logout.

**Acceptance:** FR-009 through FR-011, FR-015, FR-018; H1/H2 and S2.

## UI-06: Confirmed mock Meta replacement, receipt and recovery

**Entry:** the owner has a nonempty completed run and a connected mock Meta destination.

1. Discover authorized targets through `GET /api/connections/{id}/catalogs`. Provide at least the two
   mock Meta targets. Keep selected destination account and target catalog visible beside the saved
   source/result context; choosing a source catalog does not choose an output target.
2. Before a new publication, present an explicit full-replacement confirmation naming the simulated
   destination/account/catalog, selected immutable result, included count and saved rule context.
   State that all current items in that mock target will be replaced. No prechecked consent or silent
   submit on target selection. Cancelling this confirmation creates no publication intent.
3. On confirmation, create one client `request_id` for that immutable action and call
   `POST /api/publications` with the saved run, destination connection/catalog and `confirm_replace`.
   Do not send browser-built product rows/hash, change the key on a transport retry, or automatically
   retry. The server computes/binds the stored projection and its canonical JSON digest.
4. Show the returned application record and separate simulated receipt/readback evidence. A receipt
   alone does not justify `published`: fresh adapter observation must confirm target, exact output,
   hash and count. The digest is not a hash of CSV bytes and is never recomputed in the browser.
5. `GET /api/publications` and `GET /api/publications/{id}` restore recorded metadata/state. Label the
   observation time. When `can_reconcile` is true, **Check destination** calls
   `POST /api/publications/{id}/reconcile` for fresh independent readback; merely rereading application
   metadata is not a fresh provider observation. Failed publications do not offer this action.
6. Offer an explicit retry only when the server identifies a definite failed/not-applied, unsuperseded
   intent as eligible through `can_retry`. Call `POST /api/publications/{id}/retry`; retain its
   immutable intent/key. This may submit the first actual effect after a definite not-applied failure;
   it is distinct from exact create replay, which never resubmits. Re-publishing an older saved run
   after newer work is a new deliberate, confirmed action with a new client key, not replay of an
   obsolete failed intent.

### Publication state presentation

| State/evidence | Meaning and permitted UI action |
| --- | --- |
| `pending` | Application intent is recorded but completion is unconfirmed. Block a new intent for that target. While its operation is active, both recovery actions are unavailable; an idle pending record can offer Check destination when the server permits it. Do not claim a provider effect yet. |
| `unknown` | The effect cannot be determined from the request outcome, and the intended replacement may already be present. Offer Check destination only when the server permits it; block a newer intent for that same target. |
| `published` | Required independent evidence established the simulated effect. Show its receipt and last-checked time; describe current target state separately. An eligible Check destination refreshes the observation, not the effect. |
| `failed` with authoritative not-applied evidence | Explain the rejection/absence. The failed action did not replace the target; preserve valid CSV without claiming an old observation is still current after unrelated later work. Offer only currently eligible Retry, never Check destination. |
| Historical receipt, target later replaced | Preserve the earlier publication history and identify that the current target contains a later replacement. Do not relabel history as failed or imply old content is still active. |
| Historical effect removed by explicit mock reset | Preserve historical published status but show missing current readback and `destination_effect_missing`. Do not claim presence, silently restore it, or treat it as an eligible failed-intent retry. |
| Readback unavailable | Preserve last known evidence with its timestamp and indicate current state is unknown/unavailable. A read timeout is not authoritative absence. |
| `publication_superseded` | An older failed retry may not overwrite a newer intent for the same target. Offer inspection of current history, not a force-success/reapply action. |
| `publication_busy` | Another operation for this publication is still active. Retain known state, disable duplicate recovery and offer deliberate metadata refresh/retry later; this rejection performed no adapter call or target unlock. |
| `publication_not_reconcilable` | The record is not eligible for Check destination, including a failed record. Refresh its metadata and preserve the recorded failure reason; do not turn permanent rejection into retryable absence. |
| `empty_publication` | Zero-row replacement is blocked. The valid header-only CSV remains available. |

Use the API's [action eligibility matrix](catalog-api.md#action-eligibility), not a second client
permission model. Its booleans are point-in-time hints: commands recheck them, so a stale enabled
button can legitimately receive a busy, reconnect or ineligible response. With an expired/revoked
destination grant, offer destination reconnect while retaining the application session, result and
publication record; retrieve fresh eligibility afterward. Reconnect does not itself reconcile or
retry. An active operation is checked before grant expiry and cannot be reconciled into absence.

Valid application output/CSV survives every publication outcome. Unchanged prior destination
contents are promised only for a definite no-effect failure. Uncertainty may follow a committed
replacement; show that possibility and reconcile actual evidence without promising rollback.
If displaying publication `grant_revision`, label it as last recorded adapter use, not the current
connection grant. A null or older recorded revision after a crash does not establish absence of an
effect or newer invocation.

The unresolved-intent and supersession unit is `(workspace, persistent destination connection,
external target catalog ID)`. A blocked main target does not automatically block the independent
test target. Reconnect preserves connection identity, so it cannot bypass an unresolved target guard.

Same client key plus identical immutable intent reuses the existing application record; mismatched
intent conflicts. The server publication UUID is the provider idempotency key. Reusing an old
provider key returns its original receipt without reinstalling its old contents. UI controls and
request handling must preserve these distinctions across errors and page reloads.

After reload or lost response, use recent publication metadata to find the recorded action and its
target status before proposing another intent. Do not silently generate a new action merely because
the previous POST response is missing. Application/publication and provider-effect capacities are
independent; the UI explains a capacity response without deleting history or resetting the mock.

Every destination selector, confirmation, status and receipt is visibly simulated. No status means
real Meta acceptance, campaign activation, ad delivery, learning preservation or actual ad spend.

**Acceptance:** FR-012 through FR-015, FR-018, FR-019, FR-024; H1/H2 and S1/S2.

## Accessibility, errors and original visual design

The functional UI must already have semantic forms, labels, keyboard operation, visible focus,
useful empty/loading states, no raw HTML rendering, and actionable bounded errors. Source selection,
mock consent and full-replacement confirmation need explicit decisions and focus recovery on cancel.
Associate field errors with their control, preserve summary focus for product-row errors, and clear
stale field-specific errors when the value changes without erasing unrelated problems.

Use actual links for navigation/download, preserve modified-click behavior, and identify destructive
replacement clearly. Render long titles/identifiers and all bounded rows without hiding required data.
The table may scroll within a labeled keyboard-accessible region on narrow screens. Measure the
worst supported result before introducing pagination or virtualization; neither is a default new
feature. Reduced-motion settings and actual zoom must remain usable.

The final UI/UX treatment has a required later gate, not an assumed completion here:

1. Stabilize FE/BE/DB contracts and functional UI-01 through UI-06 with real application checks.
2. Research the supplied Socioh surfaces and appropriate Behance/other operator-workbench references.
   Record what was actually inspected and the design principles worth adapting; do not claim access
   to authenticated competitor tools or copy their artwork, brand, marketing copy or page layout.
3. At that actual design phase, run the inspected ui-ux-pro-max design-system generator for the
   revised owner brief. Apply its relevant output together with frontend-design and freshly retrieved
   Vercel web-design-guidelines. Resolve conflicts in favor of the product contract. Record the
   original token/layout/state decisions and refine the working UI without changing domain behavior.
4. Independently verify final H1/H2/S1/S2 in actual Brave, including 375/768/1440 widths, true 200%
   zoom, keyboard/error focus, exact CSV and fresh mock readback. All agent browser/Playwright tools,
   packages, settings, profiles and artifacts remain in the outer `.local/`, never app tests,
   dependencies, startup commands or application environments.

This ordered gate implements FR-021, SC-007 and SC-008. The original data-workbench design, prior
skill reads, earlier screenshots or an old successful build do not satisfy it. The future public
website and creative studio remain required later product scope, distinct from this owner UI pass.

## Verification and document boundary

UI-01–06 support the two happy and two sad acceptance groups in [spec.md](../spec.md) and
[quickstart.md](../quickstart.md). Negative identity/resource tests may use a second synthetic owner
without adding another delivered actor UI. No test port is a role, and no mock receipt is live
provider proof. This contract introduces no source code, schema execution, browser harness, runtime
operation or hosted deployment.
