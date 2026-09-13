# Revised Phase 1 execution agreement

**Feature**: 001-catalog-workflow, revision 2 | **Date**: 2026-09-13
**Status**: Revised specification/execution plan; not implemented acceptance.

The latest user clarification and confirmed mock-publication choice supersede the earlier
fixed-workspace/sample-only/download-only interpretation. [Spec](spec.md) defines behavior,
[revision decisions](owner-journey-revision.md) separate direct user decisions from lead defaults,
[plan](plan.md) defines construction, and [tasks](tasks.md) is the sole active delivery queue.
Constitution 2.0.0 established this scope; amendment 2.1.0 clarifies local artifact and credential handling without changing it. Prior CSV-slice artifacts/evidence remain historical work.

## Refined implementation brief

Implement one complete, genuinely authenticated demo-owner journey in the existing Go/Next/PostgreSQL
application: sign in, enter the owned workspace, authorize a backend mock source, discover and
choose catalogs, fetch bounded raw data, run real normalization/validation/two rules, inspect and
download the immutable output, authorize/select a backend mock Meta target, confirm full replacement,
publish and verify separately durable mock state, then return/reconcile/logout safely.

Mocks are production-demo Go implementations behind narrow replaceable service interfaces, not
frontend fixtures or fabricated successful runs. Keep real application auth/ownership separate
from simulated provider authorization. Preserve the existing working catalog stages. Live
providers, real advertising/spend and creative rendering are deferred; the full future public
website and creative experience remain product direction.

Do not stop at compilation, a fixed workspace, the old sample UI or a publication acknowledgment.
Complete the revised local task gates, including functional FE/BE/DB stability, a required
reference-informed original UI/UX pass and independent final Brave verification. Hosted release
is a later separately authorized task, not a consequence of local success.

## Lead and subagent workflow

Before each feature/task change, the lead and assigned worker inspect the current scope, affected
API/data/UI contracts, dependencies, file ownership, relevant source evidence and completion checks.
Use Wayfinder and grill-with-docs for the question round between the worker and lead. The lead
answers bounded implementation choices under the user's delegation and records material defaults.
Do not fabricate the user's agreement or ask the user to repeat facts discoverable from sources.

Escalate only a material missing product/authority choice that the brief and references cannot
settle. The main endpoint question is answered: mock publication plus CSV download. Exact auth,
provider, replay, lifecycle and resource defaults are in the governing contracts, not new questions
for every worker.

Assign one writer per artifact. Define shared types and ports before parallel consumers diverge.
Keep migrations and composition under explicit ownership. Workers send contradictions to the lead;
the lead integrates corrections and informs every affected owner. Reassign completed workers to
ready work or independent review, preserving useful context rather than launching redundant agents.

Suggested boundaries, refined to exact files at assignment:

| Work owner | Bounded responsibility |
|---|---|
| Lead/integration | Spec/task decisions, cross-artifact review, shared integration, runtime lifecycle, final evidence and release boundary |
| SaaS/persistence writer | Generic identity/membership/session authority, schema/ordered migration, owner bootstrap, maintenance/lifecycle guard and scoped repositories |
| Connector writer | Mock authorizers/source/destination ports, discovery/normalization/provenance, publication/effect separation, replay and uncertainty |
| Frontend writer | Real session transport, functional owner/connection/result/publication views, then post-stability original design |
| Reviewer/verification owner | Independent contract/security/code review and agent-operated Brave evidence; no browser runner installed in app |

These are engineering assignments, not product operators or separate deployments. The business
owner uses one application URL. Other operator perspectives require later permissions/views and
must not be simulated by running extra frontend servers.

## Required skill routing

Read [application instructions](../../AGENTS.md) and resolve selected capabilities through the
outer catalog; do not copy machine-specific skill paths or install skill packages into app.
Load full instructions and their required references when the task triggers them, not the entire
catalog at every step.

| Task | Required or appropriate skills |
|---|---|
| Scope/contract round | wayfinder, grill-with-docs with grilling/domain-modeling, senior-architect; applicable SpecKit clarify/constitution/plan/tasks/analyze workflows |
| Go construction | Relevant golang-project-layout, golang-dependency-injection, golang-context, golang-concurrency, golang-database, golang-security and dependency-management guidance; select other Go-suite entries only for actual code/library needs |
| Go/DB verification | tdd, golang-testing, property-based-testing; real PostgreSQL for migration, ownership, transactional and independently durable effect claims |
| Frontend/BFF | frontend-design plus task-relevant React/Next.js guidance, security-best-practices, design-system/ui-styling; no optional cache/optimization suite is adopted merely because installed |
| Post-stability original UI/UX | ui-ux-pro-max including its required design-system workflow, frontend-design, fresh Vercel web-design-guidelines, relevant design-system/ui-styling guidance |
| Containers and security | docker-development, security-best-practices, scoped security-threat-model and evidence-led review; additional analysis/testing skills only when their scope is justified |
| Defects | systematic-debugging or diagnosing-bugs before a fix; verify source/cross-layer cause, not merely a symptom |
| Final browser operation | playwright or another authorized appropriate browser skill, with all executable tooling/dependencies/settings/evidence in the outer .local/ |
| Durable documentation | writing-for-agents and relevant source/knowledge curation guidance; preserve source-map and status distinctions |
| Actual CI failures | gh-fix-ci only when a real authorized CI failure exists; no fabricated CI-fix task |

PostgreSQL guidance applies to the actual pgx/schema/privilege work. Supabase documentation informs
later compatibility, not installation of Supabase Auth or SDKs now. Reference existing Go/mock
examples without executing unrelated projects or inspecting the shared capability host's Git state.

## Contract and stability gates

The revised spec, plan, research, data model, HTTP/provider/UI contracts, quickstart and tasks must
agree before implementation. SpecKit analysis is a read-only review phase; consequential findings
are corrected in the separate authorized editing phase and reviewed again. No current hook,
automatic commit or branch change is required.

The functional stability gate requires:

- Real provisioned-owner login/logout/expiry and server ownership checks before provider work.
- Persistent consent/grant/connection lifecycle, working catalog diversity and actual raw decoders.
- Shared validation/rules and immutable, exact preview/CSV output.
- Confirmed mock replacement, separate durable effect ledger, independent fresh readback, replay,
  target serialization and truthful failed/unknown/reconcile behavior.
- Fresh/upgrade migrations, unchanged applied migration checksum, private bootstrap, scoped runtime
  privileges and a stopped-app maintenance guard.
- Meaningful Go/PostgreSQL/BFF tests and a production build with agreed DTOs and error states.

Numeric limits and state transitions have a single detailed authority in the API/data/provider
contracts. Keep auth password/session/nonce handling out of logs, client-readable storage and
browser evidence. A real owner session is not a simulated provider grant, and a mock receipt is
not live platform publication or ad serving.

## Mandatory post-stability design pass

T061–T064 are required, after the FE/BE/DB stability checkpoint:

1. Inspect the supplied Socioh surfaces and three to five suitable Behance/other operator-workbench
   references. Record URLs, what was actually observed and which interaction/layout principles help
   the established owner flow. Public marketing pages do not establish authenticated product behavior.
2. Use ui-ux-pro-max's inspected design-system generator at the actual design phase, combine relevant
   recommendations with frontend-design and freshly retrieved Vercel web guidance, and record original
   tokens/layout/state decisions in docs/ui-design.md.
3. Improve the original login, workspace, consent, source selection, catalog results and publication/
   recovery UI without changing backend behavior or copying competitor branding, artwork, text or
   page layout. The earlier light data-workbench tokens are an interim baseline, not permanent
   differentiation. Do not silently expand this pass into the later full website or creative studio.
4. Recheck semantics, keyboard/focus, form errors, long data, reduced motion, responsive behavior,
   bounded performance and production build before final browser acceptance.

A skill read, generated recommendation, initial screenshot or earlier build is not completion of
this pass. The agent must implement and visually evaluate the revised UI.

## Independent browser and runtime verification

Start the application normally and obtain its address. The agent then opens that address in actual
Brave and independently exercises the four revised journeys. Application unit/integration tests
remain in the codebase; the agent's browser code, Playwright packages, launch configuration, binary
selection, profiles, downloads, screenshots, traces and other evidence all remain outside app in
the outer workspace's .local/. No application startup/test command launches the agent's browser or
receives its settings.

Prefer one active normal frontend. When an approved failure check needs a test-only provider
composition, operate it briefly and stop the owned fixture afterward. Native/fault/packaged copies
are test environments, not business actors. Confirm process/container ownership and database scope
before restarts; preserve data. Never close a potentially user-owned browser tab/session blindly.

Cookies are host-scoped, not isolated by localhost port. If verification temporarily needs separate
databases/runtimes on one hostname, use separate owned browser profiles or reauthenticate deliberately
after a sequential replacement; do not assume ports create independent sessions or tenants. Local
testing retains a trusted-workstation boundary; hosted exposure needs a dedicated TLS/origin review.

Verify real login/session boundaries, source and target selection, exact decoded downloads, fresh
independent provider readback and replay/recovery. Cover 375/768/1440 widths, actual 200% browser zoom,
keyboard navigation and error/consent/confirmation focus. Inspect screenshots and console/network
behavior; distinguish expected negative responses from unexpected hydration/CSP/runtime errors.
Preserve failed attempts and redact credentials/session/nonce data from every shared artifact.

## Completion and handoff

T069 requires complete revised local behavior, post-stability original design, observed final Brave
flows, fresh scoped security/dependency/image/runtime checks and current privacy-safe documentation.
Known image advisories require recorded applicability and remaining limits, not blanket suppression
or a fabricated clean bill of health. New auth/provider/publication code requires fresh review;
earlier CSV-slice scans do not cover it.

Leave one normal frontend URL and report exact implementation/test/runtime scope. Do not stage,
commit, push or publish unless separately authorized. T070/T071 preserve the later hosted-access
and actual-deployment gate. No document, mock, local test or image build proves a hosted release.
