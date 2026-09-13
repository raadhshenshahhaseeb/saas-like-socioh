# Implementation Plan: Demo Owner Catalog Workflow

**Feature**: `001-catalog-workflow` | **Revision**: 2 | **Branch**: `master` (unchanged)
**Date**: 2026-09-13 | **Spec**: [spec.md](spec.md)

**Authority**: [Owner-journey revision](owner-journey-revision.md), [execution contract](execution.md),
and [the current constitution](../../.specify/memory/constitution.md). Direct user scope decisions and
lead-resolved defaults remain distinguishable in the revision and research records.

**Status**: Cross-reviewed revised implementation design. Existing code and historical verification
cover the earlier CSV slice. This plan does not claim the owner/session, connected-source,
mock-publication, or final design work is implemented or verified.

## Summary

Deliver a complete authenticated demo-owner journey: credential login and workspace context;
simulated source consent; discovery and selection across Shopify-like and generic-feed providers;
real fetching/decoding, validation and the two deterministic rules; immutable result inspection;
CSV download; and explicitly confirmed full replacement of a selected mock Meta catalog, verified
through independent receipt/readback. Include logout, reconnect, return to prior results, and safe
recovery of failed or uncertain publication.

Next.js owns the original operator UI and same-origin BFF. One Go process composes SaaS Manager,
Connector Manager, catalog stages, and replaceable Go source/destination adapters. PostgreSQL stores
application state and separately durable simulated provider effects. Sharing a deployment/database
does not turn an external-style effect into part of the application's transaction.

This replaces the earlier anonymous fixed-workspace, fixture-selector and download-only boundaries.
It preserves the working parser/rules/result foundation. The broader online website and creative
experience remain required product direction; they are not delivered by this bounded workbench.

## Technical Context

**Language/Version**: Retain the reviewed toolchain and lockfiles: Go `1.26.8`, Node `24.21.0`,
Next.js `16.3.5`, React `19.3.0`, and TypeScript `5.9.3`. Recheck dependency/security compatibility
when implementation changes the graph; historical scan results do not certify the revised build.

**Primary Dependencies**: Go standard library for HTTP, contexts, JSON/CSV, exact textual decimal
handling and cryptographic randomness; the existing pgx PostgreSQL driver/pool; Argon2id from
`golang.org/x/crypto v0.57.0` (Go 1.26.0 minimum verified) for password verification; Next.js server routes, React, CSS Modules and
semantic CSS tokens. No general dependency-injection container, UI framework, browser runner,
external identity provider, broker or extra manager deployment is required.

**Storage**: Ordinary PostgreSQL with ordered checksummed migrations. Application state covers
the synthetic user/workspace/owner membership, hashed sessions, authorization attempts and grants,
connections, catalog-run provenance/results, and publication intent/status. A separate mock-provider
ledger owns receipts, ordered effects and current target contents without cascading application
foreign keys. Raw input is transient. See [data-model.md](data-model.md).

**Testing**: Go unit/race/integration and focused property assertions, real PostgreSQL migration and
authority checks, BFF/session transport checks, production build and packaged runtime verification.
Exactly H1/H2/S1/S2 remain the acceptance groups; supporting assertions do not create another product
test campaign. Final browser verification is an independent agent activity outside application tests.

**Target Platform / Project Type**: A Next.js frontend, one Go backend and PostgreSQL, packaged as
one local Compose application. Provider mocks are Go services behind interfaces within that backend,
not browser fixtures or additional publicly exposed provider deployments. Hosted release is later.

**Performance Goals**: Bounded, attributable behavior and explicit failure states. No million-SKU
benchmark, throughput SLA, production-provider equivalence or causal advertising uplift is claimed.

**Constraints**: Canonical limits are in [owner-journey-revision.md](owner-journey-revision.md),
[research.md](research.md), and the [API contract](contracts/catalog-api.md). They include 1 MiB raw
input, 1,000 products, two mutation/four read admissions, bounded body/processing/read/cleanup work,
a five-connection pool with one reserved lifecycle-guard connection and four request connections,
two password-hash admissions, five failed-login reservations per sixty-second window, session/attempt/
grant lifetimes, and separate 100-record workspace capacity limits for attempts, runs, application
publications and mock effects. Replay lookup precedes publication/effect capacity rejection.

**Scale/Scope**: One pre-provisioned synthetic owner and workspace, two working source kinds,
multiple selectable source catalogs, CSV upload, and two mock Meta targets. A second owner/workspace
is allowed only in negative integration fixtures. Public registration, invitations, billing, other
operator UIs, live providers, creative rendering and audiences remain outside this revision.

## Constitution Check

| Principle / gate | Design disposition | Evidence needed before completion |
| --- | --- | --- |
| Complete owner journey | Login, actual membership authority, consent/discovery/fetch, real processing, mock publication/readback, CSV and logout are explicit. | H1 and H2 through the actual application and provider ports. |
| Explicit composition | One Go application; narrow constructor dependencies; concrete provider adapters outside catalog logic. | Wiring/source review and boundary tests. |
| One authority | Go owns identity, resource policy, catalog results and publication state. Next transports one named session cookie and renders public DTOs. | Session/BFF checks and negative owner/resource tests. |
| Honest external-style effects | App intent and mock ledger commit separately; acknowledgment is not readback; current contents are distinct from receipt history. | Lost-ack/crash, replay, supersession and fresh-readback assertions. |
| Small meaningful verification | Two happy and two sad groups; required supporting checks remain attributed to them. | [Quickstart](quickstart.md) evidence for this revised scope. |
| Privacy and portability | Synthetic identities/data, ordinary PostgreSQL, no secrets or machine paths in repository documents; browser tooling outside app. | Auth/log/privacy review, migration upgrade and package inspection. |
| Required design sequence | Functional FE/BE/DB stability precedes reference research, required skill-guided original UI refinement, then independent Brave. | FR-021, SC-007 and SC-008 gate records. |

No constitution exception is proposed. Re-evaluate these gates after all revised documents agree
and again against implementation evidence. The earlier four CSV browser results and image checks
remain historical regression evidence, not proof that the new gates pass.

## Responsibility and dependency boundaries

| Component | Revised responsibility | Boundary that must remain explicit |
| --- | --- | --- |
| Owner UI | Login/session states, owned workspace, source/destination consent, catalog choice, result history, publication confirmation/status and logout. | A displayed role or hidden button is not authorization. |
| Next.js BFF | Named HttpOnly-cookie handling, exact-origin/custom-header mutation guards, bounded raw request transport, route-specific statuses and safe responses. | Extract the session server-side; ignore arbitrary browser authorization/workspace/provider headers. Never expose the session token to client JSON/storage. |
| SaaS Manager | Provisioned identity, password verification, hashed sessions, absolute/idle expiry, membership and owner capabilities. | Pass a server-resolved principal into use cases; replace the fixed global workspace authority. |
| Connector Manager | Authorization attempts/grant revisions, connection lifecycle, discovery, selected-resource checks, raw acquisition and processing orchestration. | App identity, provider permission and data-purpose permission are distinct. |
| Catalog stages | CSV and specified Shopify-like JSON decoding, normalization, whole-input validation, literal prefix/exclusion, stored projection and CSV encoding. | Provider payloads do not fabricate completed results or bypass common validation. |
| Publication orchestration | Persist immutable intent, enforce replay/target guards, call submit and fresh readback, record truthful outcome, reconcile/retry. | No application SQL transaction is passed to a destination adapter. |
| Provider adapters | Simulated authorize/revoke, source discovery/fetch, destination discovery/submit/readback. | [Provider ports](contracts/provider-ports.md) are replaceable contracts, not real Shopify/Meta certification. |
| Application repositories | Owner-scoped identity/session/connection/run/publication state, explicit transitions and migrations. | Resource ownership is checked on every operation, including before a new provider effect. |
| Mock effect ledger | Independently committed idempotent effects, receipts, target sequence/current contents and fresh observations. | Application reset/deletion cannot erase or retract provider evidence. |

See [contracts/ui-flow.md](contracts/ui-flow.md) for the customer-facing state contract and
[contracts/catalog-api.md](contracts/catalog-api.md) for exact HTTP routes, DTOs, cookies, statuses
and limits. UI contracts consume these definitions rather than duplicate backend business rules.

## Composition and lifecycle

1. `main` loads validated typed configuration and a signal context; bootstrap constructs logging,
   the bounded PostgreSQL pool, application repositories, the independent mock-ledger adapter,
   clocks/randomness/password services, SaaS authorization, provider adapters, use cases and HTTP.
   Before recovery/serving, reserve one pool connection for the exclusive lifecycle advisory lock
   `812307413`; a second Go instance or concurrent maintenance must fail its try-lock. A bounded
   one-second heartbeat checks that session, and loss fails readiness and shuts down serving rather
   than reacquiring in place. The pool maximum remains five, leaving four request connections.
   This is a single-instance guard, not a partition-proof distributed lease. Cleanup closes
   previously acquired resources on partial construction failure.
2. Preserve the real explicit migration command. Verify the ordered known version/checksum history
   and apply pending versions. Migration 001 remains byte-for-byte unchanged; append the owner,
   connection/provenance and publication changes. Account bootstrap is separate, privileged and
   driven by private configuration. Migration/restart never resets an existing owner password.
   Migrate, bootstrap-owner and both reset commands take the same exclusive lifecycle try-lock on
   their operator connection before any migration lock; they refuse while the application serves.
3. Normal requests resolve a session and membership into an authenticated principal. Go resolves
   every selected connection, catalog, result and publication in that workspace. Do not alter a
   shared global owner/workspace object to serve requests from different principals.
4. Simulated consent is a five-minute single-use attempt bound to initiating owner/workspace,
   provider, account and capability. A bounded per-workspace/provider lifecycle try-lock serializes
   mutations without a waiting queue; contention returns `connection_busy`. Approval revalidates
   current authority, expiry and revision after the adapter call, then atomically consumes the
   attempt and stores the grant/connection. Initial pending connection ID stays null until approval;
   reconnect retains the existing ID and advances grant revision. Denial/cancellation issues no grant.
   The safe owned attempt list recovers a lost creation response: inspect an approved result or cancel
   and deliberately restart a live pending attempt when its one-time nonce is lost. List/detail
   reads derive effective expired state without writing or inventing a decision timestamp; expired
   attempts permit a fresh attempt without requiring cancellation first. Source/provider
   authorization remains distinct from application login. Disconnect blocks newly authorized calls,
   not completion of already authorized in-flight work, and promises no effect rollback.
5. Shopify-like raw JSON and feed/upload CSV are bounded and genuinely decoded. Validate completeness
   and provenance, then common product rules before exclusion. Completed run rows/settings commit
   atomically; failed processing produces no completed export. Recent metadata lists let the owner
   return after login without exposing full projections in list responses. Frontend bootstrap finishes
   session resolution first, prioritizes provider/connection/attempt metadata, and schedules histories
   and selected details within the shared four-read admission ceiling; it does not burst all lists
   simultaneously or use expected throttling as the normal startup path.
6. Publication reserves its server-generated candidate UUID's operation try-lock before the pending
   intent becomes visible, and retains it through Submit, Readback and final status recording.
   Release it on every exit; exact create replay releases its unused candidate and returns the
   existing record without resubmitting. Retry locks the existing publication before its conditional
   pending transition; reconciliation takes the same lock before Readback. A concurrent recovery
   action returns `publication_busy` without adapter work or target unlock, preventing a premature
   absence observation. No application SQL transaction spans an adapter call. Submit and readback
   use independent ledger operations; mark `published` only with fresh matching evidence.
7. Unresolved intent and superseded-retry guards apply per target `(workspace, persistent connection,
   external catalog ID)`. Two targets are independent. An old provider key returns its historical
   receipt without replacing a newer target. A new deliberate action may choose an older run, with
   a fresh full-replacement confirmation; it is not a retry of an obsolete intent. The API action
   matrix permits reconciliation only for idle pending/unknown/published records with an active
   grant; failed records retain their cause and permit retry only when definitely retryable,
   latest, authorized and target-free. Server-returned action flags are hints rechecked by commands.
   Valid CSV is always retained. Only definite no-effect failure promises unchanged prior target
   contents; an uncertain outcome may already contain the intended replacement and needs readback,
   not a rollback claim.
8. Logout revokes the server session and clears client access. Client requests are cancelled, but
   completed results or already accepted provider effects are not claimed retracted. On restart,
   unfinished processing becomes failed and unfinished publication becomes unknown; explicit fresh
   reconciliation settles possible effects. No automatic retry worker or broker is introduced.
9. Guarded stopped-app reset retains user/workspace/membership/credentials, revokes sessions and
   clears application workflow records. It leaves simulated provider effects intact. A separately
   confirmed mock-provider reset clears only the verified synthetic provider scope. Explain capacity
   and residual target contents to the operator; no public reset endpoint exists.

## Required delivery and original-design sequence

These are execution gates for this feature, not a second task queue. [tasks.md](tasks.md) owns work
assignments and evidence; the phase ledger owns later product scope.

1. **Contract agreement:** reconcile specification, this plan, research, data model, HTTP/provider/UI
   contracts and quickstart. Resolve core contradictions with the lead and perform independent
   SpecKit consistency analysis before implementing the revised journey.
2. **Functional FE/BE/DB stability:** implement the usable owner flow and boundary tests. Establish
   fresh/upgrade migrations and private seed, real login/logout/expiry/ownership, both source kinds,
   consent/discovery/fetch, exact processing/CSV and independent mock publication/readback. Verify
   known/unknown failure, replay and restart semantics. A stable page with the old fixture selector
   is insufficient. This is the prerequisite portion of SC-007.
3. **Reference-informed design research:** once that stack is stable, inspect the specified Socioh
   surfaces and suitable Behance/other operator-workbench references. Record URLs, actual text/image/
   interaction coverage, applicable principles, and original design choices. Do not invent access
   to an authenticated competitor app or copy branding, assets, copywriting or page layout.
4. **Required original UI/UX refinement:** apply ui-ux-pro-max, frontend-design and Vercel
   web-design-guidelines to the established owner workflow. At this actual design phase, inspect
   and run ui-ux-pro-max's required design-system generator for the revised brief, then evaluate its
   recommendations against project authority. Fetch fresh Vercel guidelines for the review.
   Record semantic tokens, layout, responsive/focus/error states and why the result is original.
   Prior workbench tokens are an interim baseline, not the final product's differentiation.
   FR-021 and SC-007 require this pass after stability; a historical skill read is not completion.
5. **Independent final browser verification:** an agent uses the running application URL in actual
   Brave for H1/H2/S1/S2, source/consent/publication recovery, exact downloads and fresh destination
   readback, 375/768/1440 widths, actual 200% zoom and keyboard/error focus. All Playwright code,
   dependencies, launch settings, profiles and evidence remain outside app in the outer workspace's
   `.local/`; application tests/startup receive no browser settings. This establishes SC-008.
6. **Recheck and hand off:** assess revised security/dependencies/images, process/DB privileges,
   privacy and packaged runtime. Keep one normal frontend active; stop redundant owned fault
   fixtures without deleting their data. Report local readiness separately from hosted deployment.

The broader public website and creative studio remain required later direction. The design gate
improves the complete Phase 1 owner dashboard; it neither permanently locks the product into a data
table nor silently adds rendering, galleries, other operator UIs, or real ad publication now.

## Project Structure

### Feature documents

```text
specs/001-catalog-workflow/
  owner-journey-revision.md
  spec.md
  plan.md
  research.md
  data-model.md
  contracts/catalog-api.md
  contracts/provider-ports.md
  contracts/ui-flow.md
  quickstart.md
  tasks.md
  checklists/requirements.md
```

### Source placement: preserve and extend the existing frontend/backend layout

The existing directories remain. New paths below are planned implementation placement; this document
does not create them or claim their behavior exists. Related tests stay beside the source they test.

```text
frontend/
  src/app/page.tsx                         # authenticated owner dashboard
  src/app/login/page.tsx                   # provisioned-owner credential entry
  src/app/api/auth/.../route.ts            # login/session/logout BFF routes
  src/app/api/providers/route.ts
  src/app/api/connections/.../route.ts
  src/app/api/connection-attempts/.../route.ts
  src/app/api/catalog/runs/.../route.ts     # existing result family + metadata list
  src/app/api/publications/.../route.ts
  src/components/owner-shell.tsx
  src/components/source-connections.tsx
  src/components/mock-consent.tsx
  src/components/catalog-workflow.tsx      # extend existing result/data UI
  src/components/publication-panel.tsx
  src/lib/auth-client.ts
  src/lib/connection-client.ts
  src/lib/catalog-client.ts
  src/lib/publication-client.ts
  src/lib/server/catalog-proxy.ts
  src/lib/server/auth-session.ts
  src/proxy.ts                            # nonce protection for relevant product pages
backend/
  cmd/app/main.go
  cmd/app/bootstrap.go
  cmd/testserver/main.go                   # test-only fault composition
  internal/app/app.go
  internal/config/config.go
  internal/saas/service.go
  internal/saas/auth.go
  internal/saas/sessions.go
  internal/saas/policy.go
  internal/connector/manager.go
  internal/connector/ports.go
  internal/connector/authorization.go
  internal/connector/publications.go
  internal/connector/providers/shopifymock/
  internal/connector/providers/feedmock/
  internal/connector/providers/metamock/
  internal/catalog/model/
  internal/catalog/parsing/csv.go
  internal/catalog/parsing/shopify_json.go
  internal/catalog/validation/
  internal/catalog/transformation/
  internal/catalog/pipeline/
  internal/catalog/export/
  internal/store/postgres/                 # identity, connection, run, intent and mock-ledger adapters
  internal/httpapi/                        # explicit auth/resource/publication routes
  migrations/                             # unchanged 001 + ordered appended migrations
compose.yaml
scripts/                                  # application lifecycle, not browser automation
Makefile
docs/runbook.md
```

Canonical synthetic provider fixtures belong with their Go adapters and remain controlled by the
assigned fixture owner. The old built-in sample endpoint/selector is not the revised connector
journey. Retain useful parser regression fixtures, and migrate/retire obsolete public sample surfaces
through explicit tasks rather than leaving an anonymous bypass beside authenticated sources.

## Complexity and release boundaries

The added identity, connection and publication records are required by the complete owner journey.
The independent provider ledger and replay/unknown-state guards are required to model an effect that
can survive a failed app acknowledgment. These do not justify a broker, event-sourced platform,
additional manager services, generic permission engine, or real provider integration in this phase.

Ordinary PostgreSQL is retained. Future Supabase adoption requires explicit identity/role/RLS,
schema exposure and migration verification; it is not a zero-change claim. Before hosted release,
confirm access/TLS, secrets, ingress limits, cleanup/retention and backup/resource policy under the
separate deployment authorization. Neither current local Docker startup nor this revised plan
establishes hosted delivery.
