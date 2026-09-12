# Specification support provenance

Project-owned Bash support and the five core templates were copied from
[`github/spec-kit` revision d848fb4e18f44640ad6b42e60a280551ee90cdce](https://github.com/github/spec-kit/tree/d848fb4e18f44640ad6b42e60a280551ee90cdce).
The upstream license is retained in [LICENSE](LICENSE).

Included scripts: `common.sh`, `resolve-template.sh`, `setup-plan.sh`, `setup-tasks.sh`,
and `check-prerequisites.sh`. Included templates: constitution, specification, plan, tasks,
and checklist. They are unmodified upstream files. Shared skill instructions remain external;
this directory contains no installed skill package, CLI environment or Git extension.

Reviewed relevant script behavior before execution: project-root and explicit feature resolution,
template precedence, local writes, lack of provider calls, and no automatic branch/commit actions
in this selected configuration. No presets, extensions or hooks are configured. If those are added,
review their dependencies and exact targets before executing them. Temporary files must use the
workspace's persistent scratch location when a selected path needs them.

Use `.specify/feature.json` as the current feature pointer. The Git branch and feature directory
are independent; setup retained the existing Git branch.
