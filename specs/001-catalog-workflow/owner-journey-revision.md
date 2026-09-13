# Phase 1 owner-journey revision

Date: 2026-09-13. Status: governing scope correction; detailed contracts/tasks are cross-reviewed.
This supersedes the earlier fixed-workspace, sample-only and download-only exclusions. It does not
claim that the revised capabilities are already implemented. Constitution 2.0.0 records the change.

## Direct user decisions

- Phase 1 includes a complete demo-account/authentication and workspace-owner journey.
- Shopify-like and other provider behavior is mocked in appropriate backend Go packages/services,
  behind replaceable interfaces; it is not implemented as browser fixtures or cosmetic source tiles.
- The owner fetches catalogs from different sources through the actual connector responsibilities.
- The user explicitly confirmed publication to a backend mock destination plus CSV download.
  Live provider integrations and creative rendering remain deferred.
- Once FE/BE/DB contracts and the functional owner journey stabilize, research Socioh and suitable
  Behance/other operator-workbench designs, then improve the original UI/UX with ui-ux-pro-max,
  frontend-design and Vercel web-design guidance. Independently verify final flows in Brave.
- All agent browser/Playwright tooling, packages, settings, profiles and evidence remain in the
  outer workspace's `.local/`. No browser runner/settings are part of the application or its tests.
- The future public website and creative experience remain required product direction. Current
  workbench choices are Phase 1 presentation, not permanent differentiation or the whole product.

## Lead-resolved bounded defaults

These choices implement the user's delegated clarification policy; they are not quoted user values.

### Account and owner

Provision one synthetic user, one workspace and an owner membership through a privileged local
bootstrap command. Provide actual credential login, current-session retrieval, logout and expiry.
Do not add public registration, password reset, invitations, billing or other operator UIs.
Use generic user/membership/session entities so later actors do not require replacing a global owner.

Go SaaS owns identity, password verification, sessions, membership and resource authorization.
Next.js owns pages and narrowly controlled HttpOnly-cookie transport. It extracts only the named
application cookie server-side and constructs the fixed Go authorization header; arbitrary browser
authorization/workspace/provider headers remain untrusted. The browser never receives the opaque
session token in JSON, JavaScript storage or URLs. Login is protected by exact Origin/custom-header
checks as are all mutations. Application-session expiry and provider-grant expiry are different states.

Password hashing: Argon2id through a reviewed library, 19 MiB, two iterations, one lane, random
16-byte salt and 32-byte key; bounded password bytes and two hash admissions. Sessions use 32 random
bytes with only their SHA-256 hashes stored; eight-hour absolute and thirty-minute idle lifetimes;
at most ten active sessions per owner. Bound failed-login work to five attempts per minute for this
single-demo deployment without an unbounded key map. Bootstrap secrets stay in private runtime
configuration; existing owner credentials are not silently reset by migration or restart.

A second synthetic owner/workspace is permitted only in negative integration fixtures to prove
resource isolation. Different operators normally share an application with scoped views and
permissions; localhost runtime variants are not actors.

### Connected source providers

Implement two working source kinds: a Shopify-like mock with at least two distinguishable catalogs,
and a generic-feed mock with at least one catalog. CSV upload remains an additional intake path,
not a substitute for connected-source discovery. No arbitrary remote URL or real credential input.

Each provider has a real simulated connect/approve/deny/cancel/discover/fetch/disconnect/reconnect
lifecycle in Go. Authorization attempts are five-minute, single-use and bound to the initiating
user, workspace, provider, selected external account and requested capability. A persisted connection
retains its identity on reconnect and advances its grant revision. Use one connection per provider
kind per workspace for this demo; grant expiry defaults to one hour. Bound retained attempts to
100 per workspace and one pending attempt per provider kind. These flows are not real OAuth conformance.

The Shopify-like fixture uses a deliberately small documented raw JSON schema with exact decimal
strings. A real decoder/normalizer maps it to the shared product model. Generic feed and upload use
the real CSV parser. Both converge on the same validator, two rules, result persistence and export.
Retain source connection, provider/catalog identity, format/schema revision and complete-snapshot
provenance; never turn incomplete fetch into empty success. SKU uniqueness remains per input run,
not a claim that SKU is a global provider identity. Real-provider schemas/mappings remain later work.

Existing 1 MiB/1,000-product bounds, exact decimal rules, validation-before-exclusion, immutable
completed output, two POST/four read admissions, bounded deadlines and database pool remain.
Source disconnection prevents future fetches; it does not erase already owned completed results.

### Mock publication

The Meta-like mock offers an authorized destination connection and at least two selectable target
catalogs. Publish only an explicitly confirmed full replacement using an immutable, nonempty
completed run. Zero included products remains valid for CSV but returns `empty_publication` for
publication. Every screen, receipt and status identifies simulation; no real ad serving is implied.

Persist the application publication intent separately from the mock-provider effect/receipt ledger.
Do not share an application SQL transaction with the adapter. The sequence is durable intent,
independent adapter effect, then application status updated after independent readback matches
target, output hash and count. The mock ledger survives application restart and never cascades
from application connection/publication deletion. Sharing PostgreSQL does not make future external
API effects transactionally atomic with application records.

Application states are `pending`, `unknown`, `published` and `failed`. Pending after a crash becomes
unknown. Receipt acknowledgment alone is not verified publication; fresh adapter readback is required.
Historical receipt evidence and the currently active target replacement remain distinct.

Client `request_id` is an application replay key unique within the workspace. The server-generated
publication UUID is the provider idempotency key. Same immutable intent reuses its record; mismatched
run/target/hash returns 409. A duplicate provider key returns its original receipt without reapplying
an old snapshot. One pending/unknown intent is allowed per destination; unknown blocks a newer one
until explicit reconciliation. Authoritative mock absence can resolve to not-applied/failed. Retrying
an older failed intent after a newer intent returns `publication_superseded`. Re-publishing an older
run is possible only as a new deliberate action. No automatic retry, queue or force-success endpoint.

Every publication outcome preserves valid completed CSV. Definite no-effect failure leaves the
prior destination unchanged; uncertainty may already contain the intended replacement and must
be reconciled honestly, without a rollback or unchanged-target guarantee. Bound application intents
and independent mock effects to 100 each per workspace;
replay lookup happens before capacity rejection. Credentials/grants, raw input and secret-bearing
payloads never appear in logs or browser evidence.

### Migrations and reset

Preserve applied migration 001 byte-for-byte. Extend the runner to verify an ordered known migration
history and apply pending versions; append the new identity/connection/provenance/publication schema.
Keep ordinary PostgreSQL and scoped runtime/operator grants, with no Supabase-specific auth coupling.

Serve and maintenance share an exclusive database-session lifecycle guard. Serve reserves one
connection within the existing maximum-five pool, leaving four for request work; a second Go
instance and direct maintenance refuse while it is held. Lock-session loss fails closed and stops
serving. This is a bounded single-instance guard, not a partition-proof distributed lease.

The explicit stopped-app reset retains users, workspace, membership and credentials; revokes sessions
and clears application attempts/connections/publications/runs. It does not retract mock-provider effects.
A separate guarded mock-provider-reset with a distinct confirmation clears only synthetic mock state.
Instructions must explain that application reset can leave the simulated destination populated or at
capacity. No public reset or automatic deletion is added.

## Required verification and design sequence

1. Reconcile all feature documents, contracts, migration implications and tasks. Lead and workers
   use Wayfinder/grill-with-docs; run independent SpecKit consistency analysis before implementation.
2. Implement and test the real owner/auth and mock-provider journey across FE/BE/DB. Keep exactly
   two happy and two sad acceptance groups, with focused security/failure assertions supporting them.
3. Establish the stack-stability gate: contracts agree, migrations/seed work, owner authorization and
   full source-to-publication/readback behavior pass real Go/PostgreSQL and BFF checks.
4. Research visual/interaction references from Socioh and suitable Behance/other product-design sites.
   Record URLs, inspected evidence, useful principles and original design decisions. No copied assets,
   brand identity, marketing copy, page layout or invented authenticated competitor access.
5. Apply ui-ux-pro-max and frontend-design with Vercel web-design guidance to an original operator UI.
   Preserve domain behavior; cover login, workspace, consent, source selection, results and publication
   states. The full future website/creative studio is not silently added to this Phase 1 design pass.
6. Agent independently verifies final H1/H2/S1/S2 in Brave at the running URL, including 375/768/1440
   widths, real 200% zoom, keyboard/error focus, exact downloads and independent destination readback.
   All browser tooling/evidence stays outside app. Prefer one active normal frontend; fault compositions
   are temporary verification fixtures, not separate operator applications.
7. Recheck security, dependencies/images, privacy, runtime and documentation against the revised code.
   Prior CSV-slice checks and image triage do not certify new auth/provider/publication behavior.

## Evidence and current implementation boundary

The earlier catalog slice, native H1/H2/S1/S2 browser checks and tested UTC timestamp correction remain
valid historical work. The current Docker application demonstrates that smaller slice only. Native
test frontends and the separate native-test database were stopped; data volumes were preserved.
The revised owner/auth/connection/publication capabilities and post-stabilization design pass are
not complete until the new tasks and observed evidence establish them. Hosted deployment remains
the separately authorized later gate.
