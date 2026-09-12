# Specification tooling location

This directory is reserved for project-owned SpecKit support: configuration, templates, scripts, and any project-specific context the selected workflow needs. Feature specifications, plans, and tasks can be kept in `specs/` at the repository root once a feature is defined.

Status: selected core Bash scripts and templates are initialized from a pinned upstream revision;
the Phase 1 constitution is present. The active feature is `specs/001-catalog-workflow`, selected
by `feature.json`. No presets, extension hooks, auto-commit/branch operations or global CLI
installation were added. See [PROVENANCE.md](PROVENANCE.md) for the exact support snapshot.

When specification work begins, inspect the selected workflow and initialize only the required support within this repository. Check configured hooks and context-update targets before execution. Keep general workspace instructions and external capability locations outside this repository; any local agent/context documents must contain only project-relevant, privacy-safe information.

Follow [the repository instructions](../AGENTS.md), including the rule that generated documents, links, examples, metadata, and command output must contain no personal information or machine-specific paths.
