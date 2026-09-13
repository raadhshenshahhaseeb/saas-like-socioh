# Owner journey persistence contract

Status: normative design revision, 2026-09-13. Implements the decisions in
[owner-journey-revision.md](owner-journey-revision.md); not proof that revised migrations/code exist.
[HTTP contract](contracts/catalog-api.md) owns public DTOs/errors; [provider ports](contracts/provider-ports.md)
own raw formats and canonical projection/digest. Ordinary PostgreSQL, explicit pgx repositories,
one Go process, no Supabase Auth/RLS dependency, background queue or implicit schema creation.

## Ownership graph and namespaces

```text
users ── memberships ── workspaces
  └── sessions ───────────┘
workspaces ── authorization_attempts ── connections
          ├── processing_runs ── result_items
          └── publications ── owned completed run + owned destination connection

catalog_mock.effects: independent simulated-provider receipts/projections
  scoped synthetic namespace; no FK/cascade from application rows
```

Application records use `catalog_app`; migration metadata remains `catalog_meta`. Independent
provider simulation uses `catalog_mock`. Schema separation denotes ownership, not a separate
security process: the same bounded runtime pool may serve separately injected repositories.
An application transaction is never passed into the provider adapter or ledger repository.

All public resource operations resolve a verified session and active owner membership, then query
with workspace scope. Composite foreign keys reinforce scope but do not replace request authorization.
Only one normal synthetic owner/workspace is provisioned; second-owner/workspace integration fixtures
exercise isolation without creating a public registration/multi-tenant management feature.

## Common storage rules

- Internal IDs: UUID. Times: `timestamptz`, normalized to UTC at transport. Counters/revisions: bounded
  nonnegative integers, positive when issued. Provider identifiers: text, ASCII grammar from ports,
  at most128 bytes. Safe messages at most256 characters; failure details arrays at most100 objects.
- Secrets: password hash and salt/parameters only; SHA-256 session/attempt-nonce hashes are32-byte
  `bytea`. Raw password/session/nonce is not persisted. Mock grant references are opaque internal
  synthetic authorization references, never browser DTOs; they are not real provider credentials.
- Required unique keys and checks must be database constraints. Every SQL value is parameterized;
  no browser-controlled table/schema/order expression. Multi-record state transitions use explicit
  transactions. Read result snapshots consistently and close rows/transactions on every path.
- One pool, max5 connections/acquire2 s. One connection is reserved for the lifecycle guard below,
  leaving4 for request work. Do not hold an app transaction/request connection while invoking
  source or destination adapters. All DB work honors deadlines. Standalone operator commands have
  a30-second deadline; resource closure/failure cleanup is bounded by2 seconds.

## Identity and sessions

| Entity | Required fields, keys and checks |
|---|---|
| `users` | `id` PK; `login` unique case-sensitive ASCII3–64 `[A-Za-z0-9._-]`; `display_name` text1–80; `password_hash` encoded Argon2id parameters/salt/key; `enabled` boolean; `created_at`, `updated_at`. |
| `workspaces` | Existing `id` PK, `slug` unique and `created_at`; migration002 relaxes the literal `slug='demo'` constraint to a bounded safe slug so a second synthetic integration workspace is possible. Runtime still provisions only `demo`. |
| `memberships` | `(user_id,workspace_id)` PK/FKs; `role` currently `owner`; `active` boolean; timestamps. No public membership mutation. |
| `sessions` | `token_hash`32-byte PK; `user_id`, `workspace_id` composite FK to membership; `created_at`, `last_seen_at`, `expires_at`, `revoked_at` nullable; expiry after creation, last_seen within lifetime. Index user/expiry for bounded admission/pruning. |

Standard identities: workspace `11111111-1111-4111-8111-111111111111`, user
`22222222-2222-4222-8222-222222222222`, login `demo-owner`, display name `Demo Owner`.
The privileged bootstrap inserts a user and owner membership idempotently; migration/startup never
silently resets credentials. A configured password is16–128 valid UTF-8 bytes, used exactly; generated
default is32 random characters. Hash with Argon2id m19456 KiB/t2/p1, random16-byte salt,32-byte key
using a reviewed library and strict bounded parameter decoding. No plaintext/default password in SQL.

Login verifies enabled identity and membership, then creates32 random session bytes and persists only
SHA-256. Resolve the permitted workspace from the membership, not login JSON. This revision expects
one active owner membership per provisioned identity; unexpected ambiguity fails closed instead of
choosing an arbitrary workspace. Sessions capture that workspace and recheck membership/user status.

Absolute lifetime8 hours, idle30 minutes. Effective validity requires not revoked, now before both
absolute expiry and last_seen+idle, enabled user and active membership. Successful authorization
advances last_seen without extending absolute expiry; a race cannot revive an expired/revoked session.
Logout records revocation. Before a new insert, under a user-keyed lock, prune expired/revoked sessions
in bounded batches of100 and enforce10 active sessions; never evict an active session silently.
Runtime lifecycle has bounded session growth; expired rows are not indefinite audit history.

## Authorization attempts and connections

| Entity | Required fields, keys and checks |
|---|---|
| `authorization_attempts` | UUID PK; workspace/user bound through membership; provider/account/capability; nonce_hash32; `expected_grant_revision` (0 for initial); nullable connection_id; `status`; created/expires/decided times. Unique live pending attempt per workspace/provider, enforced transactionally with expiry transition and a partial unique index. |
| `connections` | UUID PK, workspace FK; provider ID/role/account; capability; status `connected|disconnected`; opaque grant_ref; positive grant_revision; grant_issued_at/expires_at/revoked_at; timestamps; unique(workspace,provider_id), unique(workspace,id). |

Provider IDs/roles/capabilities use the fixed registry. Attempts expire after5 minutes and count
toward a retained100/workspace cap, including terminal attempts; no automatic history pruning.
One live pending attempt per provider/workspace. Before new admission, expired pending attempts
become expired; expired records remain counted. No user-controlled capability/account outside the
workspace's adapter registry. Failed capacity admission creates no attempt.

Index `(workspace_id,created_at,id)` for the bounded newest-first attempt metadata list. Return at
most100 owned-workspace attempts, including pending/terminal state, with no nonce/hash/grant secrets.
This list provides recovery when an attempt was committed but the creation response containing its
ID/nonce was lost: discover ID, inspect status, cancel and begin a new attempt. It never restores
the original nonce or changes authority/consumption rules. No query parameters or broader history
feature is required.

Read DTOs derive effective `expired` whenever stored status is pending and `now >= expires_at`.
List/detail GET does not write the status or synthesize decided_at; lifecycle mutations persist the
expiry transition under their normal guard. Retained caps still count that row. A new attempt need
not first cancel an already expired attempt; approval continues to reject it.

Attempt states: `pending→approved|denied|cancelled|expired`, terminal transitions never reissue a
grant. Initial pending connection_id is null; reconnect captures existing ID and grant revision.
Serialize lifecycle mutations with a non-blocking per-(workspace,provider) try-lock, bounded to the
configured workspace/provider registry. Apply it to attempt creation/decision/cancel, reconnect and
disconnect; unknown IDs cannot grow a lock map. Busy returns409 connection_busy, no queue/adapter call.
The lock spans the short approval workflow, but no DB transaction/request connection spans Authorize.

Under the lifecycle lock, prevalidate nonce hash, initiating user/workspace/session, pending state,
expiry, provider/account and expected revision. For initial approve allocate a candidate connection
UUID and pass it as AuthorizationInput.ConnectionID; do not persist it on the pending attempt.
Reconnect passes the current persisted ID. After Authorize returns, validate the returned candidate
grant matches ID/ownership/capability/revision, then in the final transaction recheck current
session/membership, nonce/binding, unexpired pending state and connection revision with row locks/
conditional transitions. Earlier revocation or stale state must not be missed. Persist that exact
ID/grant and approved attempt atomically; failure creates no active candidate connection. Denial/
cancellation issue no grant. All exits release the try-lock; duplicates never advance a revision.
Database acknowledgment uncertainty is not proof the transaction failed; inspect persisted attempt
state before describing its outcome. Synthetic candidate issuance is side-effect-free outside this
app commit; these semantics are not a real OAuth exchange/credential-recovery contract.

Connection identity persists across reconnect; account cannot change in this demo. Approval advances
revision and grants1 hour. Effective API state is reconnect_required when stored connected but expired,
otherwise connected/disconnected. Expiry is not application401. Disconnect commits revoked/disconnected
and cancels pending reconnect attempts before an adapter Revoke call outside its DB transaction.
Adapter failure cannot reactivate local access. Revocation blocks new calls seeking authority after
that commit; a call already authorized/admitted may complete afterward even when its effect was not
yet accepted at revocation time. Preserve actual in-flight outcomes; do not promise atomic cancellation
or rollback. Historical results/effects remain. Normal disconnect never deletes provenance rows.

## Catalog runs and items

Preserve the existing three-table catalog data and exact decimal semantics. Extend the model:

| Record | Revision additions |
|---|---|
| `processing_runs` | Permit source_kind `provider` in addition to legacy `sample|upload`; add nullable source_connection_id, provider_id, external_account_id, external_catalog_id, source_format, source_schema_version, source_revision, source_complete, source_grant_revision, fetched_at. Composite FK(workspace,source_connection_id) to connections when present. |
| `result_items` | Add nullable `source_item_id` for mock JSON product identity, unique within (workspace,run) when nonnull; preserve five canonical fields and original position. |

Provider runs require owned source connection/provider/account/catalog and captured grant revision;
format/revision/fetch time are filled only when established. Completed provider runs require complete
snapshot metadata, supported schema and fetched_at. Failed intake may retain null unavailable metadata,
never invented completeness. Upload completion records CSV schema/completeness; legacy sample runs
remain readable and retain original source identifiers. No raw input, uploaded filename or credentials.

Existing result invariants remain: run-scoped original position1–1,000, case-sensitive unique SKU,
title/prefix/control validation, `numeric(18,4)` after lexical validation, uppercase currency and
availability enum. Preserve `(workspace,run)` composite FK and canonical included-row projection.
Do not reinterpret SKU as a global provider identity. Source-item identity is provenance, not an
extra exported column. Normalized input and transformed title/inclusion persist; raw bytes do not.

Run states stay processing/completed/failed. Admission validates envelope/rules/source authorization,
then under workspace advisory lock counts/inserts, cap100 including failures. Processing uses real
raw decoder/normalizer → shared validator → rules. Completion transaction checks processing, inserts
all valid items and commits counts/status/timestamp together. Failure updates only processing. A
committed completed result cannot be overwritten by cancellation or failed commit acknowledgment.
Startup marks leftover processing failed/interrupted; no raw resume. Known IDs and bounded metadata
lists recover completed results after restart/login. All-excluded completion remains header-only CSV.

## Publications: authoritative application intent

`publications` stores one logical intent/attempt; an additional parent-publication hierarchy is not
needed. Required fields:

| Fields | Contract |
|---|---|
| id,workspace_id,request_id | UUID PK; workspace FK; unique(workspace,request_id); unique(workspace,id). Server id is the provider idempotency key; request_id is browser replay only. |
| run_id,connection_id | Composite workspace FKs to completed run and persistent destination connection. Completion/capability checked by service transaction, not inferred from FK. |
| provider_id,external_account_id,external_catalog_id | Immutable selected target snapshot; matches connection/authorized registry. |
| target_revision | Positive monotonically increasing intent order per(workspace,connection,catalog); assigned under scoped admission lock. Used for stale retry checks, not provider effect order. |
| mode,output_hash,item_count,projection_version | Immutable `replace`,64-lowercase-hex SHA-256,1–1,000, `catalog-output-json.v1`. Exact projection comes from immutable run rows. |
| initial_grant_revision,last_grant_revision | Initial authority capture immutable; last revision records actual adapter use, nullable until recorded. Update on authorized Submit/Readback use, including after reconnect. Public grant_revision maps to last_grant_revision, never the connection's current revision. |
| status,created_at,updated_at,published_at | Status pending/unknown/published/failed; published_at nullable until first verified matching readback, retained as historical evidence. |
| receipt_id,receipt_applied_at,receipt_hash,receipt_count | Nullable until acknowledgment/observation; bounded provider identifier/hash/count. Receipt alone does not establish published. |
| observed_at,readback_matches,current_receipt_id,is_current | Last independent readback; nullable until observed. Historical receipt versus current target replacement remain distinct. |
| failure_code,message,details | Nullable or bounded sanitized fault; no provider secret/raw exception/projection duplication. |

Immutable intent fields never change. Publication retry updates operational fields only. Standard
runtime cannot delete publication/result rows. Partial unique index on target WHERE status IN
('pending','unknown') enforces one unresolved intent per exact destination catalog; Meta's second
catalog is independent. List/index `(workspace,created_at,id)` and owned run filter remain bounded100.

Admission order: authenticate/validate input and owned resources → allocate candidate server UUID
and reserve its publication operation try-lock → scoped request_id replay lookup/compare immutable
run/target/hash → release unused candidate on exact replay and return original without Submit →
validate new effect permission/completed nonempty run → workspace count/cap100, target conflict,
next target revision and pending insert atomically. The candidate operation lock MUST already be
held when pending becomes visible. Retain it across Submit, independent Readback and final outcome
recording, including bounded cleanup; release on every error/cancellation/replay/success exit.
Replay remains observable after grant expiry and does not submit; new effect requires current grant.
Concurrent duplicate request IDs cannot consume capacity twice. Different payload under same key409.

Release app transaction before adapter call. Provider Submit independently commits; subsequent
Readback independently reads. Only matching target/hash/exact bytes/count establishes published.
An app write failure after provider commit cannot roll back the effect. Conditional updates preserve
confirmed publication; unknown/error paths never invent no effect. A pending request abandoned by a
crash becomes unknown at single-instance startup. No automatic resubmission/reconciliation worker.

Explicit reconcile acquires the existing owned publication operation lock before reading the adapter;
it is allowed only for idle pending/unknown/published records under an active grant. Pending/unknown
found/matching→published, authoritative absence→failed/not_applied, unavailable→unknown. Failed
records return409 publication_not_reconcilable without Readback or failure-cause mutation; permanent
rejection cannot be rewritten into retryable absence. Explicit retry requires failed, definite
retryable/not-applied cause, latest target_revision, active grant and a free target; acquire the
existing publication operation lock BEFORE CAS to pending, then retain it through the effect/outcome.
Any newer target intent
supersedes older failed retry. A duplicate provider key returns its previous receipt without effect.
Published reconciliation may refresh is_current=false after a newer replacement. Explicit mock reset
can remove that effect; preserve historical published_at/status while reporting missing current
readback, rather than fabricating current presence or silently republishing.

Operation-lock entries exist only for active server-generated candidates or existing owned IDs,
bounded by two admitted POST operations; remove entries on release. Unknown browser IDs cannot
allocate locks. Reads observe whether an operation is active without allocating a lock. Busy
reconcile/retry returns409 publication_busy with zero adapter calls and no state change/unlock.
Conditional SQL state/revision guards remain; no DB transaction is held across adapter calls.

Eligibility follows the API matrix: active operation or expired/revoked grant makes both flags false;
idle pending/unknown/published with active grant permits reconcile only; failed never permits
reconcile and permits retry only for the definite retryable/latest/free-target conditions above.
Commands recheck all conditions; returned flags are not authorization or a reservation. Last used
grant revision is updated from the actual adapter invocation, not merely because the connection
was reauthorized. If a crash prevents recording use, nullable/older last_grant_revision is the last
known recorded use, not proof that no newer invocation occurred. Unknown targets remain blocked.

## Independent mock-provider effect ledger

`catalog_mock.effects` is owned by the mock adapter and accessed through its injected ledger. It has:
workspace_namespace UUID (intentionally no app FK), provider/account/catalog IDs, provider_key UUID,
receipt_id UUID, positive applied_sequence, applied_at, output_hash, item_count, projection_version,
and exact projection_bytes `bytea` bounded4 MiB. Unique(workspace_namespace,provider_key), unique
receipt_id, unique(workspace_namespace,provider,account,catalog,applied_sequence). The second owner's
fixture namespace/accounts differ from the normal owner; one workspace cannot read another's effects.

This namespace is a simulation ownership guard, not browser-supplied authority. There is no FK/cascade
to app publications, connections or runs. Different transactions/repositories make the effect durable
independently even though the database server/process is shared.

Submit transaction takes the workspace-namespace admission lock, checks existing key first, validates
same target/hash, counts cap100, and inserts receipt/projection with the next per-target sequence.
Original receipt is returned on duplicate without advancing sequence; mismatch conflicts. A new
receipt atomically represents a full replacement. Latest sequence per target determines current
projection; no second mutable target table is required. Counts include all effects, not just current
ones, with no automatic prune. Stable serialized digest/bytes and bounded decoding are checked.

Readback queries this table freshly, by namespace/key plus expected target; returns historical receipt
and current receipt separately. Successful absence is authoritative; DB error is unknown, not absence.
Capacity failure before effect is definite not_applied and preserves prior target state. Injected
after-commit failure verifies the application's unknown/reconcile behavior.

## Exclusive lifecycle guard

Use a PostgreSQL session advisory lock with named Go constant `LifecycleLockKey int64 = 812307413`.
Serve acquires it exclusively using `pg_try_advisory_lock` on one connection reserved from its existing
max5 pool, before serving/recovery. Failure to acquire rejects startup; another Go process on the same
database cannot overlap. Keep the connection reserved until shutdown, then explicitly release/close.
The existing migration-transaction key812307412 remains distinct; acquire lifecycle before migration
locks. Ordinary request SQL uses the remaining4 pool connections and existing acquire/deadline bounds.

Migrate, bootstrap-owner and both reset modes obtain the same exclusive try-lock on their operator
connection and refuse while serve holds it, in addition to role/database/seed/confirmation checks.
No separate pool or lock server. Health/readiness must fail when guard ownership is lost. Monitor the
reserved session with a1-second bounded heartbeat (1-second query deadline); on failed heartbeat or
connection closure, stop accepting work and shut down rather than reacquiring in place. This is an
ordinary database-session single-instance guard, not a partition-proof distributed lease/fencing system.
An already accepted provider effect remains subject to the publication uncertainty rules.

## Migration, bootstrap and reset contracts

Migration001 remains byte-for-byte unchanged. Append reviewed migration002; enhance runner with an
ordered embedded manifest of version/SQL/SHA-256. Under migration lock, verify existing history is
an exact known prefix, reject unknown/checksum/order drift, then apply pending versions and ledger
entries transactionally. Verify requires the complete known manifest. Opening runtime pool never
migrates. Migrations add generic identity/connection/publication/mock schema and relax only the old
fixed-workspace/source-kind constraints necessary for the revision; preserve existing run rows.

`catalog_migrator` owns schemas/DDL and privileged bootstrap/reset. Runtime grants only needed
identity reads, session insert/update/prune, bounded attempt/connection transitions, run/item writes,
publication transitions and mock ledger insert/read. No runtime DELETE on retained run/publication/
effect data, no schema ownership, no broad PUBLIC grants. Reset/credential provisioning uses operator
credentials, never forwarded to Next/runtime requests. Readiness checks schema/seed without mutation.

CLI syntax to implement:

- `app migrate up`: apply pending migrations, verify all checksums.
- `app bootstrap-owner`: privileged idempotent seed using configured `DEMO_OWNER_PASSWORD` and
  expected demo database; absent owner created, existing hash never overwritten. Launcher supplies
  generated private password when needed; command does not print it. Identity constants above.
- `app reset --confirm-demo-reset`: after owned app stopped, validate exact configured database,
  operator role, workspace and manifest; reject active work. Revoke sessions; delete owned publications,
  result items/runs, attempts and connections in FK-safe order; retain users/workspace/membership/hash.
  Never delete independent mock effects. Clear outcomes are documented; no public reset route.
- `app mock-provider-reset --confirm-mock-provider-reset`: separately require stopped app, exact
  database/role/standard synthetic workspace namespace; delete only its catalog_mock effects. No app
  data deletion/cascade. Historical published records can subsequently report missing destination effects.

Both resets use the exclusive database lifecycle/ownership guard, not merely a browser confirmation. An app
reset can leave mock catalogs populated/at capacity; only the distinct mock reset clears them.
Published reset/seed commands are protocol names, not claims of existing CLI implementation.

## Verification required

Test live-server→direct-CLI maintenance rejection, second-Go startup rejection and fail-closed loss
of the reserved DB session (owned integration-fixture termination only), plus fresh001→002 and upgrade
of existing001 data, full checksum/history drift rejection, scoped
grants, owner/session expiry/revocation and second-workspace isolation, lifecycle try-lock contention/
release, candidate connection-ID binding, post-authorizer authority/expiry/revision revalidation,
in-flight completion after revoke, atomic attempt consumption,
source provenance/real normalization, run caps/completion, publication replay/caps/target ordering,
independent ledger restart/readback, after-provider-commit crash, concurrent reconcile while initial
Submit is active (publication_busy, zero Readback, no false absence/target unlock), failed permanent
reconcile rejection, effective attempt expiry without GET writes, stale retry, and both reset scopes.
These support H1/H2/S1/S2; no revised capability is accepted solely because this contract exists.
