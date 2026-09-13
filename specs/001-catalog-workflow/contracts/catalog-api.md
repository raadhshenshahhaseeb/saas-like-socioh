# Owner, catalog and mock-publication HTTP contract

Status: normative design revision, 2026-09-13, not implementation proof. Replaces historical
sample-only/no-auth exclusions under [owner-journey-revision.md](../owner-journey-revision.md) and
[the current constitution](../../../.specify/memory/constitution.md). [Provider ports](provider-ports.md)
own raw grammars, fixture IDs, canonical validation and digest encoding; [data-model.md](../data-model.md)
owns persistence invariants. [spec.md](../spec.md) owns acceptance requirements.

## Transport and authority

Browser prefix `/api`, private Go prefix `/v1`, identical remaining paths. Go verifies sessions,
membership and resource ownership; browser IDs never establish authority. Every protected query
includes the server-resolved workspace and checks nested connection/catalog/run/publication ownership.
Foreign and unknown resource IDs have identical404 responses. Only login, idempotent logout and
minimal private health routes are outside protected-resource middleware.

Next requires exact configured `Origin` plus `X-Catalog-Request: 1` on every POST, including login,
logout and consent, before reading bodies. It reads only the named `catalog_session` cookie and
constructs private `Authorization: Bearer <opaque-session>` itself. Browser Authorization, workspace,
provider and forwarding headers are not trusted. Go validates that bearer token; it accepts no
browser-cookie alternative. Upstream origin/routes are fixed, not request-controlled.

Cookie: `catalog_session`; HttpOnly, SameSite=Lax, Path=/, no Domain. Secure is enabled for HTTPS,
explicitly disabled only for configured local loopback HTTP. Max-Age is at most Go's remaining
absolute expiry; idle expiry is enforced server-side. Configuration, not browser-forwarded host,
selects attributes. No token in browser JSON, URLs, JS storage, logs or evidence. Next clears the
cookie after logout/confirmed401; losing a cookie does not prove server revocation.

| Bound | Contract |
|---|---|
| Admission | Shared2 POST and4 GET/export slots per Next/Go process, before body reading; no per-route multiplication. |
| Bodies | JSON16 KiB; multipart1 MiB+16 KiB; raw provider input1 MiB; at most1,000 products. |
| Deadlines | Go POST30 s from entry including read/auth/DB/provider; GET5 s; body10 s; headers5 s/write45 s/idle60 s. Next POST total45 s/upstream35 s/body10 s within total; reads5 s. |
| DB/cleanup | Pool5 including1 reserved exclusive lifecycle-lock connection (4 for requests), acquire2 s; context-bounded; failure recording at most2 s, no detached business work. |
| Responses | At most4 MiB; details100; list endpoints100 metadata records, no preview/product arrays. |

JSON is one UTF-8 object; unknown/duplicate properties at any depth, invalid UTF-8, extra values,
null unless explicitly nullable, or wrong types are400. Preserve raw JSON/multipart through Next
so Go can reject duplicates; cap JSON nesting at8 levels. Unsupported media415, unknown path404, unsupported method405 with
Allow. GET has no body or query parameters except the documented publication `run_id` filter.
All responses no-store/nosniff; safe errors exclude raw files, filenames, SQL and dependency secrets.
IDs use lowercase canonical UUIDs; provider IDs follow [ports](provider-ports.md). Timestamps are
UTC RFC3339 with `Z`. Nullable fields serialize null, not invented values.

## Routes

Paths below follow either prefix. All POST bodies are JSON except the documented upload variant.

| Method/path | Success | Operation |
|---|---:|---|
| POST `/auth/login` |200| Credentials → session. |
| GET `/auth/session` |200| Current user, workspace, expiry. |
| POST `/auth/logout` |200| Revoke session; missing/expired token is idempotent success. |
| GET `/providers` |200| Fixed provider/account/capability registry. |
| GET `/connections` |200| Workspace connections. |
| GET `/connection-attempts` |200| Recent workspace attempt metadata; recover lost creation response without nonce. |
| POST `/connection-attempts` |201| First authorization attempt. |
| GET `/connection-attempts/{id}` |200| Safe status, no nonce. |
| POST `/connection-attempts/{id}/decision` |200| Approve/deny once. |
| POST `/connection-attempts/{id}/cancel` |200| Cancel owned pending attempt. |
| GET `/connections/{id}` |200| Connection detail. |
| POST `/connections/{id}/disconnect` |200| Revoke future use. |
| POST `/connections/{id}/reconnect` |201| New attempt for same connection/account. |
| GET `/connections/{id}/catalogs` |200| Authorized source catalogs or destination targets. |
| GET `/catalog/runs` |200| Recent metadata, newest first. |
| POST `/catalog/runs` |201| Synchronous fetch/upload and real processing. |
| GET `/catalog/runs/{id}` |200| Owned run detail. |
| GET `/catalog/runs/{id}/export` |200| Completed CSV. |
| GET `/publications` |200| Recent metadata; optional owned `run_id` filter. |
| POST `/publications` |201 new /200 replay| Confirm and execute immutable intent. |
| GET `/publications/{id}` |200| Persisted intent/state/last readback. |
| POST `/publications/{id}/reconcile` |200| Fresh independent readback, never submit. |
| POST `/publications/{id}/retry` |200| Explicit eligible retry, same provider key. |

Private Go `/healthz` is process health; `/readyz` verifies lifecycle-guard health, DB, complete known migrations,
owner/workspace/membership seed and required schemas without creating data. Old `/catalog/samples`
is not exposed by this revision; historical sample runs remain readable. No public signup, reset,
invitation, arbitrary URL, real OAuth or force-publication route.

## Authentication

Login fields: `login` (case-sensitive ASCII `[A-Za-z0-9._-]{3,64}`), `password` (16–128 valid UTF-8
bytes, exact, no trimming/normalization). Standard login is synthetic `demo-owner`; no password
literal is provided here. Bad structural input400; absent/disabled user, bad password or inactive
membership share401 `invalid_credentials`.

Browser login/session success DTO:

```json
{
  "user":{"id":"22222222-2222-4222-8222-222222222222","login":"demo-owner","display_name":"Demo Owner"},
  "workspace":{"id":"11111111-1111-4111-8111-111111111111","slug":"demo","role":"owner"},
  "session":{"expires_at":"2026-09-13T12:00:00Z","idle_expires_at":"2026-09-13T04:30:00Z"}
}
```

Private Go login additionally returns top-level `session_token`:43-character unpadded base64url
encoding of32 random bytes. Next validates this response, sets its cookie and strips the field;
malformed internal response503/no cookie. GET session never returns a token. Go stores only its
SHA-256 hash, eight-hour absolute/thirty-minute idle expiry, at most10 active sessions/user.

Two hash admissions plus a fixed-size global five-failed-login/60 s budget: reserve before hashing;
pending reservations count; success releases its reservation without clearing previous failures;
failure stays until its60 s window expires. Full budget429 `login_rate_limited`, bounded Retry-After.
No unbounded address/login map. Logout body `{}`, response `{ "signed_out":true }`. DB failure503
does not claim server revocation; Next may clear its cookie and explain uncertainty. Application
session expiry401 `session_required` is distinct from provider-grant expiry409.

## Providers and connection lifecycle

GET providers: `{providers:[Provider]}`. Provider fields `id,label,role,simulation:true,capability,
accounts:[{id,label}]`. Source capability `catalog:read`; destination `catalog:write`. Fixed IDs,
accounts and independent fixture namespaces are defined in [ports](provider-ports.md).

Initial attempt body `{provider_id,external_account_id}`. Both must be a permitted registry pair;
server determines capability. Existing persistent connection409 `connection_exists`; reconnect
body `{}` on that connection starts a new attempt preserving account/identity. Creation marks old
expired pending attempts expired, then enforces100 retained attempts/workspace and one live pending
attempt/provider/workspace. Same pending kind409 `authorization_pending`; retained cap429.

Creation/reconnect response `{attempt:Attempt,state:<nonce>}`; GET-by-ID/cancel response `{attempt:Attempt}`.
State is32 random bytes, base64url, returned once and stored only hashed. Keep in component memory,
not URL/storage. Reload without nonce requires cancelling/restarting the attempt. Attempt fields:
`id,provider_id,external_account_id,capability,status,created_at,expires_at,connection_id,decided_at,
simulation:true`. Only connection_id and decided_at are nullable. Status `pending|approved|denied|cancelled|expired`.
Internal initiating owner/workspace/provider/account/revision binding cannot be overridden later.

GET `/connection-attempts` returns `{attempts:[Attempt]}`, scoped to the authenticated owner's
workspace, at most100 records ordered by `(created_at,id)` descending. No query parameters, nonce,
nonce hash, grant reference or credential fields. It includes pending and terminal metadata using
the same safe Attempt DTO as GET-by-ID. If creation committed but its response was lost, the owner
uses this list to find the pending attempt, inspect its status and cancel/restart through the
existing routes. The list does not recreate/reveal the original nonce or authorize approval without
one; `authorization_pending` need not disclose a hidden nonce or be the only recovery mechanism.
On list and detail reads, a stored pending attempt with `now >= expires_at` is returned with effective
status `expired`. GET does not mutate its stored status or invent a decision timestamp. Lifecycle
mutations persist expiry when needed. Expired attempts cannot be approved; a fresh attempt does not
require cancelling the expired one. Other stored terminal states remain unchanged.

Decision body `{decision:"approve"|"deny",state:<nonce>}`. Verify initiating session owner, binding,
nonce, five-minute expiry, pending state and expected revision. All connection lifecycle mutations
(attempt creation/decision/cancel, reconnect/disconnect) acquire a bounded per-(workspace,provider)
try-lock; busy409 `connection_busy`, no waiting queue or adapter invocation. Approval calls the mock
authorizer outside any DB transaction, then revalidates current session/membership, binding/nonce,
expiry/pending state and expected revision before atomically consuming the attempt and storing the
grant. Initial approval passes a server candidate connection UUID into Authorize; pending attempt's
connection_id remains null, and only successful final commit persists that exact ID. Reconnect uses
the existing ID. Response
`{attempt:Attempt,connection:Connection}`. Denial creates no grant, returns connection:null.
Wrong nonce403; consumed/expired/stale409; replay never advances a grant again.
Authorizer failure issues no grant and leaves the attempt pending until its existing expiry, allowing
a deliberate retry of the same decision/nonce; it does not silently create a new attempt or lifetime.
Post-authorizer expiry/stale/current-session failure likewise creates no active grant and reports
the corresponding409/401; do not claim pending when a failed DB commit acknowledgment leaves its
state unconfirmed. Release the try-lock on all paths. This is simulated consent, not a claim of
atomic real OAuth acquisition.

Cancel `{}` uses owner session/CSRF, no nonce needed because it grants nothing. Already cancelled200;
other terminal states409. Disconnect `{}` returns `{connection:Connection}` and is idempotent;
mark revoked and cancel pending reconnect attempts before calling adapter Revoke outside a DB
transaction. Revoke failure cannot restore local access. It blocks new calls seeking authorization
after the revocation commit; already authorized in-flight calls may complete afterward, not only
effects already accepted at revocation time. It does not erase owned results/destination effects
or promise immediate cancellation/rollback. Reconnect may replace healthy,
expired or revoked grants; approval preserves connection ID and advances revision.

Connection fields: `id,provider_id,role,external_account_id,status,capability,grant_revision,
grant_expires_at,created_at,updated_at,simulation:true`. Status is effective
`connected|reconnect_required|disconnected`; active expired grant reads reconnect_required,
explicitly revoked reads disconnected. No raw grant reference. List wrapper `{connections:[]}`,
provider-ID order, at most3 standard connections. Detail/disconnect wrapper `{connection:Connection}`.

Catalog response `{connection_id,role,catalogs:[{id,label,description}],simulation:true}`. No products.
Discovery/fetch/publication checks active grant and expected capability. Expired/revoked grant409
`connection_reconnect_required`, wrong capability403, unknown/foreign catalog404. Meta targets are
two distinct catalogs; publication ordering is per target, not the entire connection.

## Runs and export

Connected input JSON requires `connection_id,catalog_id`; optional `title_prefix` defaults empty,
optional `exclude_unavailable` defaults false. No sample_id or mixed mode. Resolve owned source
connection/catalog and current grant before creating run; fetch raw input, decode/normalize and
validate the whole input before rules. [Ports](provider-ports.md) define exact grammars/decimals.

Upload multipart contains exactly one `file`, optional `title_prefix`, optional
`exclude_unavailable` text `true|false`. Duplicate/unknown fields, extra files, connection/catalog/
sample fields or malformed framing400. Ignore original filename; it never selects a server path.
Missing/empty file400, excessive bytes/products413, invalid CSV/JSON/row/rule422. Input has1–1,000
products; all-filtered output can have zero. Incomplete provider fetch503 `source_incomplete`.

Run detail fields: `id,status,source,rules,counts,started_at,finished_at,preview,export_available,failure`.
Status `processing|completed|failed`; rules `{title_prefix,exclude_unavailable}`; completed counts
`{input,included,excluded}`; preview `{columns:[sku,title,price,currency,availability],rows:[Product]}`.
Product objects contain those five string fields. Actual included rows/counts must agree. Noncompleted
counts/preview are null; export_available=false. Processing finished_at/failure null; failed has
finished_at and safe failure. Completed failure=null. POST/GET detail wrapper is `{run:Run}`,
preserving the existing handler/frontend envelope.

Provider source: `kind:"provider",connection_id,provider_id,catalog_id,format,schema_version,revision,
complete,grant_revision,fetched_at,simulation:true`. Fields unavailable before/after failed intake
are null; complete=false until established. Upload source:
`{kind:"upload",format:"csv",schema_version:"catalog-csv.v1",complete:true}` on completion.
Historical sample source `{kind:"sample",sample_id:"catalog-basic-v1"}` remains supported for reads.
Run list `{runs:[RunSummary]}`, newest `(started_at,id)` descending; summary omits preview, max100.
No raw-input resume or automatic processing retry; results reopen through list/known IDs.

CSV export200 text/csv UTF-8, attachment `catalog-output.csv`; exact stored included projection,
standard quoting/LF/final LF. All-excluded completion yields header only. Failed/processing409
`run_not_complete`; unknown/foreign/malformed UUID404. Current UI settings never rewrite an old run.

## Publication and recovery

Create exact fields `{request_id,run_id,connection_id,catalog_id,confirm_replace:true}`. All IDs
required; request_id is a client UUID per deliberate action. Confirmed target/count means full
replacement. Go loads the owned completed run, owned target identity and canonical projection.
Rows, digest, workspace and provider key are not accepted from browser. Noncompleted409, empty
projection422 `empty_publication`. CSV remains valid regardless of publication failure.

Replay lookup `(workspace,request_id)` precedes new capacity/target admission. Same run/connection/
external account/catalog/output hash returns original intent200 without resubmission; mismatch409
`idempotency_conflict`. New intent cap100/workspace429. One pending/unknown per
`(workspace,connection_id,catalog_id)`; conflict409 `publication_in_progress|publication_unresolved`.
Existing intent replay is readable even after grant expiry; it does not create an effect. A new
intent or retry requires the current active Meta grant/authorized target. Server-generated publication
UUID is the provider key. Independent Meta targets do not block each other.

Before committing a new pending intent, allocate its candidate server publication UUID and reserve
its operation try-lock. Keep that reservation across pending commit, Submit, Readback and final
status recording; release on every exit. This prevents a concurrent reconcile from reading absence
in the interval before Submit starts. Exact duplicate request replay releases its unused candidate
lock and returns the existing record without Submit; it never takes over an existing active operation.
Retry also reserves the existing publication lock before the conditional transition back to pending.
After ownership lookup, reconcile reserves the same lock before any adapter Readback. No queue.
Only server-allocated candidate IDs or existing owned publication IDs may allocate entries; arbitrary
unknown IDs cannot. Active entries are bounded by the two-POST admission limit and removed on release.

Publication fields: `id,request_id,run_id,connection_id,provider_id,external_account_id,catalog_id,
mode:"replace",status,item_count,output_hash,grant_revision,created_at,updated_at,receipt,readback,
failure,can_reconcile,can_retry,simulation:true`. Hash is64 lowercase hex. Status only
`pending|unknown|published|failed`. Receipt nullable, otherwise `{id,applied_at,item_count,output_hash}`.
Readback nullable, otherwise `{observed_at,matches,is_current,current_receipt_id}`; current_receipt_id
nullable. Failure nullable or safe fault. Action booleans are server-derived current permissions.
`grant_revision` is the publication's last recorded actually used adapter grant revision, not the
connection's current revision or immutable initial revision. It is nullable before any adapter use
has been recorded; null is not evidence that no effect occurred after a crash.
Single-operation wrapper `{publication:Publication}`; list `{publications:[Publication]}`, newest
`(created_at,id)` descending, max100, optional owned run_id filter. No projection in these DTOs.

### Action eligibility

The matrix applies after current owner/resource authorization. Booleans are hints from a point-in-time
read; reconcile/retry recheck authority, operation lock, state and target guards before acting.

| Condition | can_reconcile | can_retry | Command behavior |
|---|---|---|---|
| Operation already active for this publication | false | false | Reconcile/retry409 `publication_busy`; no adapter call, status change or target unlock. |
| Idle, grant expired/revoked | false | false |409 `connection_reconnect_required`; no adapter call. |
| Idle pending/unknown/published, active grant | true | false | Reconcile allowed; retry409 `publication_not_retryable` (unknown must reconcile first). |
| Failed, active grant, definite retryable/not-applied cause, latest intent and free target | false | true | Retry allowed; reconcile409 `publication_not_reconcilable`. |
| Failed permanent rejection, superseded intent or occupied target | false | false | Reconcile409 `publication_not_reconcilable`; retry rejects with `publication_not_retryable`, `publication_superseded`, or the target in-progress/unresolved code as applicable. |

If busy and expired coincide, busy is checked first after owner/resource authorization, without an
adapter call. Failed records cannot be reconciled into a new `not_applied` failure that erases a
permanent rejection and makes it retryable. Direct requests cannot bypass a false eligibility hint.

Commit pending intent, call independent adapter, then verify fresh readback target/hash/bytes/count.
Matching readback → published; definite no-effect rejection → failed; uncertain submit/ack/readback
→ unknown. A durable new intent returns201 with actual persisted state even when failed/unknown.
Protocol/pre-admission or unverifiable DB state returns error envelope, including publication_id/
request_id when known. Never manufacture a persisted outcome when the database cannot establish it.

GET returns last recorded observation; it does not call provider. Eligible idle pending/unknown/
published reconcile `{}` reads the independent ledger without submitting. Failed reconcile returns
409 `publication_not_reconcilable` without Readback or cause mutation. For pending/unknown intent,
matching found effect → published; successful authoritative absence → failed with `not_applied`;
unavailable readback preserves unknown. Published may reconcile
to refresh `is_current`; a historical receipt remains published after a newer replacement, with
is_current=false. If an explicit independent mock reset removed a previously confirmed effect,
retain historical published status and report readback matches=false/is_current=false and fault
`destination_effect_missing`; never silently restore it.
For pending/unknown intent, found effect with mismatched target/hash/bytes/count remains unknown
with `destination_mismatch`, not retryable absence; keep that target blocked for operator investigation.
Already published history is retained on later mismatch, with readback matches=false and that fault.
Unavailable refresh retains its prior observation and reports check failure; it does not invent
a fresh observation or downgrade established historical publication.

Retry `{}` requires failed/retryable/latest intent and active grant. Unknown must reconcile first;
pending/unknown target remains blocked. Any newer intent for that target makes older failed retry409
`publication_superseded`. Retry reuses immutable intent/provider key. New grant revision for the same
connection/account can be used and recorded; target/run/hash never change. Permanent rejection or
idempotency conflict is not retryable. Re-publishing old content requires a new deliberate intent.
No automatic retry/queue/force-success endpoint. Cancellation stops business work; startup pending
becomes unknown. A committed provider effect survives lost browser delivery and app restart.

## Faults and HTTP mapping

Envelope `{error:{code,message,details:[],details_truncated:false}}`; optional known run_id,
publication_id,request_id. Safe details `{row:1,field:"sku",code:"duplicate_sku",message:"SKU must be unique."}`;
omit row for rule/envelope errors. Maximum100, no offending values/filenames/dependency messages.

| HTTP | Codes |
|---|---|
|400| invalid_request |
|401| invalid_credentials (login), session_required |
|403| origin_denied, request_header_required, authorization_state_invalid, capability_denied, owner_required |
|404| not_found, connection_not_found, attempt_not_found, catalog_not_found, run_not_found, publication_not_found |
|405| method_not_allowed |
|409| connection_busy, connection_exists, authorization_pending, authorization_expired, authorization_consumed, authorization_stale, connection_reconnect_required, run_not_complete, idempotency_conflict, publication_busy, publication_not_reconcilable, publication_in_progress, publication_unresolved, publication_superseded, publication_not_retryable |
|413| input_limit |
|415| unsupported_media_type |
|422| validation_error, empty_publication |
|429| capacity_exceeded, login_rate_limited, session_capacity_exceeded, storage_capacity_exceeded, authorization_capacity_exceeded, publication_capacity_exceeded |
|503| database_unavailable, source_unavailable, source_incomplete, service_unavailable, internal_error |
|504| deadline_exceeded |

Persisted publication faults also include provider_rejected, provider_unavailable, provider_rate_limited,
mock_capacity_exceeded, outcome_unknown, not_applied, destination_mismatch, destination_effect_missing,
cancelled, interrupted. They are not session401. Source/processing cancellation and interrupted
startup are stored failed-run codes; a disconnected request may have no deliverable HTTP response.
Only definite not-applied transient/capacity conditions are retryable. Reconnect can restore an
otherwise retryable attempt's permission. Storage caps explain operator action, not automatic expiry.

## Verification boundary

Exercise H1/H2/S1/S2 with real authentication, scoped mock connection lifecycle, raw parser/normalizer,
immutable result/export and independent destination readback. Source errors prohibit a completed
export; publication errors preserve it. BFF/Go/PG checks, final original-UI refinement, independent
Brave and packaged-runtime checks are separate evidence. Agent browser tooling stays outside app.
