# Owner journey: research and resolved clarifications

Status: revised specification research, 2026-09-13. The earlier CSV-processing slice exists and has
historical test evidence; this document does not certify the new owner/connection/publication flow.
Read [the governing revision](owner-journey-revision.md), then [data model](data-model.md),
[HTTP contract](contracts/catalog-api.md) and [provider ports](contracts/provider-ports.md).

## Authority and scope correction

Direct user direction now requires a complete demo-owner authentication/workspace journey, multiple
backend Go mock sources behind replaceable interfaces, and mock destination publication plus CSV
download. The earlier fixed-workspace/sample-only/download-only exclusions are superseded, not
reinterpreted as having implemented these capabilities. Full creative/audience/billing/live-provider
work remains deferred. The later original UI/UX and independent Brave gates are required after
functional FE/BE/DB stability, not substitutes for a complete working journey.

The lead resolved operational choices under delegated clarification: one provisioned owner,
Shopify-like JSON and generic-feed CSV mocks, two selectable Meta targets, real opaque sessions,
explicit grants, bounded synchronous work and durable simulated publication/readback. The exact
numbers, identifier names, DTOs and schema choices below are specification defaults, not quotations
of historical user requirements. Generic agent/setup instructions remain outside product requirements.

## Resolved decision record

| Decision | Rationale | Alternatives considered |
|---|---|---|
| Real credential login/session/logout for one provisioned owner; generic users/memberships | Demonstrates an actual authority boundary while allowing later actors without replacing a global-owner object. | Cosmetic login/fixed workspace was insufficient; public signup/invitations/billing would expand current scope. |
| Go owns identity/membership/policy; Next owns narrow cookie transport | One backend checks all resources; browser IDs and UI state are not authority. | Client-only checks rejected; external identity service/Supabase Auth deferred. |
| Opaque32-byte sessions hashed in DB; Argon2id passwords | Supports revocation/expiry without JWT-key/distributed-session complexity. | Plaintext/demo hardcoded credentials rejected; full identity-provider integration deferred. |
| Two functional source adapters plus upload | Proves connect/discover/select/fetch, including differences between sources. | A sample descriptor or multiple cosmetic source tiles does not prove integration behavior. |
| Small mock Shopify JSON normalizer plus existing CSV parser → shared validator/rules | Shows a real normalization boundary without inventing production Shopify compatibility. | Returning already-successful products would bypass parsing; forcing all future providers to claim CSV is misleading. |
| Persistent connection/grant and short-lived single-use authorization attempts | Approval/denial/reconnect/revocation become observable and testable. | Real OAuth/app registration/provider credentials not needed for honest simulation. |
| One Go deployment, explicit constructors and narrow ports | Keeps SaaS/connector ownership without operationally unnecessary microservices. | Separate manager/mock deployments and a DI framework were not justified. |
| Immutable completed run shared by preview/CSV/publication | Prevents rule-setting drift between demonstrated output and submitted content. | Re-running current UI rules while exporting/publishing rejected. |
| Explicit confirmed full replacement; no empty publication | Clear destination effect; valid all-excluded input still has usable CSV semantics. | Implicit merge/upsert and silent empty target replacement rejected for this bounded demo. |
| Independent mock receipt/effect ledger | Reproduces effect-before-acknowledgment failure without pretending a future provider shares an app transaction. | In-memory receipts fail restart; deriving readback from app intent is circular evidence; one shared transaction hides the important crash window. |
| Client request_id for app replay, server publication UUID for provider idempotency | Separates lost-response recovery from provider identity and avoids old-key reuse after explicit app reset. | One browser key serving both lifecycles creates reset/replay ambiguity. |
| Unknown target blocks newer work; explicit reconcile/retry, stale-intent guard | Avoids blind resubmission and delayed old content replacing a newer intent. | Automatic retry/queue, force-success and treating timeout as definite no-effect rejected. |
| Separate app reset versus mock-provider reset | Makes application intent and simulated external effects genuinely independent. | Cascade deletion or implicit target reset would erase evidence of the boundary. |
| Append migration002 and verify ordered history | Upgrades the verified slice while retaining existing results/checksums. | Editing applied001 or silently dropping/recreating demo data rejected. |
| Exclusive DB-session lifecycle guard for serve and maintenance | Direct CLI reset and a second Go instance must refuse even while the first app is idle. | Launcher-only check misses direct CLI; shared serve locks allow overlap; distributed fencing is beyond this bounded single-instance model. |

## Clarifications asked and lead answers

These are recorded outcomes of the lead discussion, not pending user questions:

| Question | Answer and owning contract |
|---|---|
| Is account creation required or can an owner be pre-provisioned? | Provision one synthetic owner and workspace; actual login/logout/expiry; no public registration/reset/invitation. Identity details in data model. |
| Which sources work, and what does replacement mean? | Shopify-like mock with two catalogs, feed mock with one, plus upload. Mocks live in Go behind ports; future real adapters need separate verified provider contracts. |
| Is publication now included? | User explicitly confirmed backend mock destination plus CSV; Meta-like mock has two target catalogs. No real ads/spend. |
| Should publishing merge or replace, and is empty output allowed? | Explicit full replacement of immutable included rows; zero-included CSV succeeds but publication is blocked as empty_publication. |
| What survives restart? | Sessions/identity, attempts/connections, completed run rows, publication intent and independent mock receipts/effects. Raw source/upload bytes remain transient. |
| Are provider callbacks actually OAuth? | No. Honest simulated approval/denial/cancellation is owner/workspace/provider/account bound, single-use and expiring; grant revisions/expiry/revoke/reconnect are real application behavior. |
| What are authentication/provider lifetimes and caps? | Central revision freezes password parameters, eight-hour/idle session rules, login budget, five-minute attempts, one-hour mock grants and record caps. Data model/API supply exact enforcement. |
| Can one Meta catalog block every other target? | No. Active/unknown and supersession scope is workspace+persistent connection+external catalog; two targets are independent. |
| How is an uncertain publication repaired? | Persist unknown, block newer target intent, explicitly read independent ledger. Authoritative absence permits failed/not_applied; retry only latest eligible intent, same provider key. |
| May older failed content be retried after a newer intent? | No: publication_superseded. A deliberate new publication may choose an older run. Duplicate provider key returns old receipt without reapplying. |
| How can outcomes be reopened after login/reload? | Bounded metadata lists for runs and publications, at most100 newest-first and workspace-scoped; no product arrays in list responses. |
| Should app reset erase simulated external publication? | No. Stopped-app reset retains user/workspace/membership/password, revokes sessions and clears owned application workflow rows. Separate stopped-app mock reset clears only its synthetic provider namespace. |
| How is stopped-app maintenance enforced directly? | One reserved connection within max5 holds an exclusive advisory lock; maintenance try-lock refuses, and lock-session loss shuts down serve. Four request connections remain. It is not a partition-proof lease. |

All substantive workflow choices needed for these assigned contracts are resolved. Hosted access,
real-provider contracts and later product phases remain explicitly deferred, not hidden missing
Phase1 requirements. Runtime/CLI enforcement details must agree with the implementation plan.

## Go reference evidence retained

Neutral reference IDs resolve through the outer workspace source map. Paths below are relative to
each reference checkout; no personal locations/authorship/runtime claims are imported.

| Reference and locator | Observed evidence | Adaptation |
|---|---|---|
| REF-GO-01 `cmd/app/main.go:25`, `cmd/app/bootstrap.go:37` | Signal-aware run/bootstrap composes infrastructure and services. | Explicit main/bootstrap and cleanup on construction failure. |
| REF-GO-01 `src/config/config.go:13`, `src/config/config_test.go:138` | Typed configuration with globals/environment reset in tests. | Retain typed config, avoid global service/config state. |
| REF-GO-01 `src/api/candles_stream_handler.go:48`, `src/api/server.go:33` | Handler delegates with request context; lifecycle owns HTTP timeouts. | Preserve bounded context propagation and server lifecycle. |
| REF-GO-02 `src/vault/service.go:19`, `:35`, `src/store/vaultstore/store.go:17` | Explicit repository/client/policy dependencies and interfaces. | Small consumer-owned auth/provider/persistence ports. |
| REF-GO-02 `src/store/db/pg.go:16`, `:79`, `:86` | Connection construction, close and health are explicit. | One lifecycle-owned pgx pool; reference ORM is not adopted. |
| REF-GO-02 `src/jsonhttp/jsonhttp.go:121`, `:160` | Options configure client behavior. | Optional callbacks suit test faults; required dependencies stay explicit. |
| REF-GO-03 `common/bootstrapper.go:59`, `rpc/settings/internal/svc/servicecontext.go:28` | Bootstrapper/service context passes dependencies. | Retain visible wiring without importing a large shared service locator. |

Reference tests were inspected, not executed: REF-GO-01 handler tests `:153/:242/:287` compose real
routes/services with controlled dependencies; REF-GO-02 health tests `:14/:43` cover injected healthy/
failed dependencies; REF-GO-03 settings test `:27` uses a database substitute that does not establish
PostgreSQL behavior. Current project checks must use its real dedicated PostgreSQL integration DB.

Adaptation cautions remain: permissive reference CORS is not our exposure policy; schema-on-connect
is not adopted; a reference health function returning success after logging failure is not readiness
evidence; reference background stubs do not justify queues. Business scope and authorship are not inferred.

## Primary security research used

The official Go proxy metadata selects `golang.org/x/crypto v0.57.0`, published 2026-09-08,
with source revision `3f62bf119e84c6e35e8518a2958089ade622d1a3`. Its module requires Go 1.26.0,
compatible with the retained Go 1.26.8 toolchain. This is the selected Argon2id dependency pin;
it is not yet added to application module files. Its transitive graph, including x/text 0.42.0,
must be reviewed/scanned when T030 implements the change. [Release metadata](https://proxy.golang.org/golang.org/x/crypto/@v/v0.57.0.info), [module requirements](https://proxy.golang.org/golang.org/x/crypto/@v/v0.57.0.mod)

On2026-09-13, OWASP password-storage guidance specified Argon2id minimum19 MiB/t2/p1. The lead selected
those parameters with16-byte random salt/32-byte key and a reviewed implementation, not custom
cryptography. Password hashing is bounded independently from request bodies. [Password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

OWASP session guidance supports unpredictable opaque identifiers, server lifecycle enforcement and
HttpOnly/Secure/SameSite controls; SameSite alone is not a complete CSRF strategy. The contract adds
exact Origin/custom-header mutation checks and trusted server cookie→bearer forwarding. The local
HTTP exception is explicit; TLS/ingress remains a hosted gate. [Session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

Existing Go dependency/image reviews apply only to the inspected smaller-slice snapshots. Their
patches remain useful, but new authentication dependencies, raw JSON and publication paths require
fresh checks. Adding an interface or fake provider does not certify external API access or policy.

## Verification and delivery gates

The revised two happy/two sad groups must establish real login and ownership, both source grammars,
source selection, exact preview/export, consent/grant lifecycle, independent destination receipt/
readback, reconnect/restart/replay and truthful failures. Supporting tests include unauthorized
workspace/catalog IDs, nonce replay, expired sessions/grants, bounded storage/hash work, source
incompleteness, zero publication, independent after-commit crash, superseded retry and separate resets.

After FE/BE/DB stability, perform the required original UI/UX reference/research and refinement,
then independent Brave checks at the running URL. All agent browser tooling/settings/evidence stays
outside app and application test commands. Re-run revised dependency/security/image/runtime checks.
Historical native/Go/PG/browser passes do not replace these new gates.

Later Coolify hosting requires explicit operator-access/TLS/origin/proxy-limit/resource/backup/
retention validation and authority. Supabase, Redis, Kafka/RabbitMQ, ClickHouse, object/CDN assets,
real provider authentication/publication, renderer/editor, audiences, agencies/billing and scale
remain later scope. No remote actions or implementation were performed by this document revision.
