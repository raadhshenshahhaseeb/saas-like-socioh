<!-- Sync Impact Report: new constitution -> 1.0.0. Added five principles, Phase 1 constraints,
specification/review workflow and governance. No prior principles removed. No dependent template
changes. No unresolved constitution placeholders. Ratification source: direct Phase 1 user brief;
lead-selected operational defaults are recorded separately in research.md. -->

# Catalog Workflow Constitution

## Core Principles

### I. One complete, bounded workflow

Phase 1 MUST demonstrate CSV/sample input, parsing, validation, deterministic transformation,
preview and CSV download. Parsing, validation, transformation and export MUST have distinct
module responsibilities. Full product scope remains in the phase ledger; future scope MUST NOT
silently become Phase 1 work.

### II. Explicit composition and replaceable external boundaries

The Go application MUST compose SaaS Manager, Connector Manager and catalog processing through
explicit constructors and narrow dependencies. Both managers run in one Go process. Mocks MUST
replace the source boundary before real CSV parsing; they MUST NOT replace the pipeline's
business behavior. Required dependencies are explicit constructor arguments or typed dependency
structs. Optional callback configuration is suitable for test doubles.

### III. One authority for catalog behavior

Next.js owns the product UI and application-facing transport functions. Go owns authoritative
catalog parsing, validation, rules, result construction and persistence. The UI MAY perform
early envelope checks but MUST display Go results rather than recompute a competing rule engine.
Preview and download MUST use the same completed result and settings.

### IV. Small meaningful verification scope

The acceptance plan MUST contain two happy and two sad scenarios. Exercise real processing with
controlled dependencies; assert content, counts and forbidden success/export on failure. Tests
are planned until actually executed. Unit or integration assertions may support those scenarios
without adding an unrelated test campaign. Live providers are not Phase 1 verification targets.

### V. Portable, private and evidence-qualified delivery

Documents, instructions, examples and metadata inside the repository MUST contain no PII,
machine-specific paths or credentials. Use synthetic product data. SQL migrations MUST remain
ordinary PostgreSQL and MUST NOT depend on Supabase-specific auth schemas, functions or roles.
Future Supabase adoption requires explicit grants/RLS/role review and migration verification;
portability is a design objective, not a proven zero-change migration guarantee.

## Phase 1 Constraints

- Next.js/React/TypeScript interface, one Go backend, PostgreSQL and Docker packaging are the
  selected direction. No Redis, ClickHouse, message broker, live commerce/ad connector, durable
  object storage/CDN, creative engine, audience processing, full authentication/agency/billing
  model, or multi-service manager deployment is required in Phase 1.
- Rules are title prefix and exclusion of unavailable products. Additional mappings, rule
  languages, provider-specific formats and source normalization belong to later scope.
- The SaaS boundary supplies a seeded demo workspace. The source mock supplies raw CSV through
  the same input contract as uploads. Unconfigured mock operations fail explicitly.
- Container deployment is a later gate after the workflow works: verify operator access,
  ingress/TLS, limits, database ownership and backup/cleanup before exposing it on the target host.
  Current specification work does not authorize remote deployment or account operations.

## Specification and Review Workflow

Use SpecKit for the feature specification, design contracts and tasks, with Wayfinder tracking
scope and decisions. The lead may answer subagent specification questions from the direct brief,
inspected references and documented operational defaults. Record the source and reason for each
answer. Do not attribute a lead default to the user or settle an unrelated product choice.

Keep requirements quality, implementation, test execution and deployment statuses separate.
Implementation task boxes remain unchecked until their work is verified. Proposed source layout
and unresolved deployment gates remain visible for review before implementation or hosting.

## Governance

Direct user instructions take precedence. Changes to Phase 1 scope, manager deployment boundaries,
the testing envelope or privacy rules require an explicit decision and a ledger update. Routine
specification defaults can be answered by the lead within delegated scope and must be labeled.
Amend this constitution with a version, date and impact note when its principles change. Do not
edit a governing principle merely to make an analysis pass. No automatic commits or external hooks
are configured for this workflow.

**Version**: 1.0.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-12
