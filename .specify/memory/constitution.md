<!-- Sync Impact Report: 2.0.0 -> 2.1.0. Explicit user-approved privacy plan clarifies
Principle V: ignored application build/runtime metadata and scoped .env credentials stay
inside app; source, documentation and release artifacts remain sanitized. Agent/browser
tooling stays outside app. Product requirements and templates are unchanged.
Historical 1.0.0 -> 2.0.0 scope amendment: Explicit user scope correction redefines Principle I
from a CSV-only demo to the authenticated owner/connected-source/mock-publication journey;
Principles II-IV now cover replaceable source/destination adapters, real authentication,
publication evidence and independent agent browser acceptance. Added post-stabilization UI/UX
gate and clarified future public website/creative scope. No template source files changed.
Dependent feature spec/plan/contracts/tasks require the separately authorized revision pass.
No unresolved constitution placeholders. Exact implementation defaults remain lead-resolved. -->

# Catalog Workflow Constitution

## Core Principles

### I. One complete, bounded workflow

Phase 1 MUST demonstrate a real demo-owner account/session and owned workspace, connecting
replaceable backend mock sources, discovering and fetching selected catalogs, real parsing,
validation and deterministic transformation, preview, CSV download and publication to a backend
mock destination with observable receipt/readback. A seeded workspace label or fixture selector
alone MUST NOT stand in for that journey. Parsing, validation, transformation and export retain
distinct responsibilities. Full product scope remains in the phase ledger; the future online
website and creative experience MUST NOT be discarded because Phase 1 has a bounded workbench.

### II. Explicit composition and replaceable external boundaries

The Go application MUST compose SaaS Manager, Connector Manager and catalog processing through
explicit constructors and narrow dependencies. Both managers run in one Go process. Phase 1
mock source and destination services MUST reside in appropriate Go packages behind replaceable
consumer-owned contracts. They exercise authorization, discovery, fetching and publication
behavior; they MUST NOT fabricate successful domain processing. Raw mock input passes through
real decoding/normalization and the shared validator/rules. Required dependencies are explicit
constructor arguments or typed dependency structs. Optional callbacks suit test-only faults.

### III. One authority for catalog behavior

Next.js owns the product UI and application-facing transport functions. Go owns authoritative
identity/session/ownership checks, catalog parsing, validation, rules, results and persistence.
The UI MAY perform early envelope checks but MUST display Go results rather than recompute
business rules or invent authentication. Preview, download and publication bind the same
immutable completed result. A completed catalog, mock publication acknowledgment and verified
mock readback are separate facts; no mock state implies live advertising or real provider access.

### IV. Small meaningful verification scope

The acceptance plan MUST contain two happy and two sad scenarios. Exercise real processing with
controlled dependencies; assert actor/ownership checks, content, counts and truthful failure states.
Source/validation failure forbids a completed export. Every publication outcome preserves the valid
completed CSV; only definite no-effect failure preserves the prior destination unchanged. An
uncertain outcome may already include a committed replacement and requires truthful reconciliation.
Tests
are planned until actually executed. Unit or integration assertions may support those scenarios
without adding an unrelated test campaign. Agent browser verification starts from the running
application URL; all Playwright code/dependencies/configuration/evidence MUST stay in the outer
workspace's `.local/`, outside app tests and application environments. Live providers are not
Phase 1 verification targets.

### V. Portable, private and evidence-qualified delivery

Source, documents, instructions, examples and shared release artifacts MUST contain no PII,
machine-specific paths or credentials. Real local credentials are permitted only in ignored,
owner-only `.env` files; `.env.example` contains safe placeholders. Application build/runtime
metadata belongs in ignored application directories and may contain necessary tool-generated
local paths, but is not a shareable release artifact. Accidental credential capture in build
caches remains prohibited. Agent/browser tooling and evidence stay outside the application.
Use synthetic product data. SQL migrations MUST remain
ordinary PostgreSQL and MUST NOT depend on Supabase-specific auth schemas, functions or roles.
Future Supabase adoption requires explicit grants/RLS/role review and migration verification;
portability is a design objective, not a proven zero-change migration guarantee.

## Phase 1 Constraints

- Next.js/React/TypeScript interface, one Go backend, PostgreSQL and Docker packaging are the
  selected direction. No Redis, ClickHouse, message broker, live commerce/ad connector, durable
  object storage/CDN, creative renderer, audience processing, full agency/billing model,
  external identity provider or multi-service manager deployment is required in Phase 1.
- Rules are title prefix and exclusion of unavailable products. A bounded mock-provider decoder
  may normalize its explicitly specified fixture shape; general real-provider formats, mappings
  and transformation languages remain later scope.
- The SaaS boundary supplies real authentication for the demo owner and server-enforced ownership.
  Provider authorization is explicitly simulated, with meaningful scoped connection lifecycles.
  Unconfigured mock operations fail explicitly; mocks are not merely frontend fixtures.
- Container deployment is a later gate after the workflow works: verify operator access,
  ingress/TLS, limits, database ownership and backup/cleanup before exposing it on the target host.
  Local synthetic account/provider simulation is authorized; external account operations,
  actual commerce/ad integration and hosted release require their later explicit instruction.

## Specification and Review Workflow

Use SpecKit for the feature specification, design contracts and tasks, with Wayfinder tracking
scope and decisions. The lead may answer subagent specification questions from the direct brief,
inspected references and documented operational defaults. Record the source and reason for each
answer. Do not attribute a lead default to the user or settle an unrelated product choice.

Keep requirements quality, implementation, test execution and deployment statuses separate.
Implementation task boxes remain unchecked until their work is verified. Proposed source layout
and unresolved deployment gates remain visible for review before implementation or hosting.

After the revised FE/BE/DB contracts and owner workflow stabilize, perform an explicit original
UI/UX refinement pass using task-relevant design skills, including ui-ux-pro-max, frontend-design
and Vercel web-design guidance. Research Socioh and relevant Behance/other operator-workbench
references for design reasoning, not copied branding, assets or layouts. Verify the resulting
operator journeys in Brave with private agent tooling. This gate MUST be represented in tasks.

## Governance

Direct user instructions take precedence. Changes to Phase 1 scope, manager deployment boundaries,
the testing envelope or privacy rules require an explicit decision and a ledger update. Routine
specification defaults can be answered by the lead within delegated scope and must be labeled.
Amend this constitution with a version, date and impact note when its principles change. Do not
edit a governing principle merely to make an analysis pass. No automatic commits or external hooks
are configured for this workflow.

Privacy amendment 2.1.0: the user approved application-local ignored build/runtime metadata and
ignored `.env` credentials with publishable `.env.example` placeholders. This changes artifact
handling, not product scope, API behavior or the independent agent-browser boundary.

**Version**: 2.1.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-13
