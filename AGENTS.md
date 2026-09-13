# Application repository instructions

## Workspace context

When the surrounding workspace is available, first read [the agent agreement](../.agents/AGENTS.md), then [current context](../.knowledge/context/CONTEXT.md). Consult [the external skill catalog](../.agents/SKILLS.md) for task-relevant skills and [the source map](../.knowledge/SOURCE-MAP.md) for evidence. These are relative workspace pointers; do not copy their machine-specific contents into this repository.

If this repository is opened independently and those files are absent or inaccessible, follow these local instructions, report the missing context when it affects the task, and use available project specifications. Do not invent unavailable decisions or search unrelated personal directories for replacements.

## Privacy boundary

All documents in this repository, including untracked documents, hidden tooling folders, generated specifications, instructions, diagrams, screenshots, and document metadata, must be free of personal information and machine-specific paths.

Use repository-relative paths, neutral source IDs, synthetic examples, placeholders, and portable commands. Remove personal names and handles, contact information, account/customer identifiers, workstation usernames/hostnames, and local absolute paths from exported material. Inspect hyperlinks and code blocks as well as visible prose. Do not embed raw handoffs, external skill locations, secrets, tokens, cookies, or private keys.

Before delivering or committing documentation, check both text and non-text outputs for privacy leakage. Keep source-location mappings and local diagnostic evidence in the surrounding workspace. Sanitize any evidence copied into project documents.

Local configuration and generated build metadata have a separate handling boundary. Real local credentials belong only in ignored `.env` files with owner-only permissions; `.env.example` contains documented keys and safe placeholders, never working secrets. Native build metadata may contain necessary resolved local paths only inside ignored build/cache directories. Neither environment files nor native metadata is a publishable artifact. Scan generated output for accidentally embedded credentials and verify release output separately; ignoring a file does not make its contents safe to distribute.

## Project tooling

- This directory is the application's Git root. Preserve existing Git state and use its existing branch until a task requires otherwise.
- SpecKit project support belongs in `.specify/`; feature documents may live in `specs/` when the workflow is initialized. These directories contain project artifacts, not installed skill packages.
- Inspect SpecKit prerequisites, hooks, and context-update targets before running them. Keep generated project context specific to this repository and privacy-safe. Read the actual configured feature pointer; do not select an active feature merely by modification time.
- Use the surrounding workspace's `../.local/` for agent-created persistent scratch files. Do not place raw diagnostic dumps or private source material in project documentation.
- Application tooling belongs in `scripts/` and works without an agent. Keep Next output in `frontend/.next/`, frontend caches in `frontend/.cache/`, Go caches in `backend/.cache/`, local Go binaries in `backend/bin/`, and application runtime records/scoped environment files in `.cache/runtime/`. These locations are ignored and excluded from image build inputs. Keep shared skill packages, agent/browser tools, profiles and verification evidence in the surrounding workspace, not in application dependencies or test commands.
- The root `.env` is the local configuration authority. Load a defined set of keys as data and pass only each process's permitted settings; database credentials never enter frontend build/runtime environments or public bundles. Preserve existing credentials during setup and migration; reject conflicting sources rather than overwriting them.
- Git administrative metadata and history are outside the current privacy task. Updating ignore rules and read-only exclusion verification are permitted; staging, committing, history rewriting, index/config changes and repository relocation are not.
- Technology choices, architecture, and implementation scope come from accepted project decisions and specifications. The availability of Go or frontend skills does not settle the stack.
