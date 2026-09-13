# Catalog workbench implementation notes

The governing workflow is [the Phase 1 specification](../specs/001-catalog-workflow/spec.md).
The lead approved one page with a 20rem control column and a flexible result area, stacked below
800px. Native form controls, CSS Modules, semantic CSS tokens, a system font at 16px, and 4px-based
spacing keep the implementation focused on processing a catalog.

Colors are defined once in `src/app/globals.css`: canvas `#F7F9FC`, surface `#FFFFFF`, text `#243244`,
muted text `#596678`, action `#275DA8`, and error `#B4232C`. Components consume semantic aliases;
their states use readable text, visible focus, and a restrained action color. There are no external
fonts, analytics, remote images, component-framework dependencies, or raw HTML rendering.

The result table displays the Go-authored projection. UI settings can become newer than a completed
result, which remains explicitly labeled with its captured settings. Starting a new run clears the
active prior output. Download errors preserve the completed preview. A known run is restored through
the `run` query parameter; this is not a history or authentication feature.

The server routes forward bounded raw bodies and selected response bytes to one configured private
Go origin. Request origin/header checks and admission happen before reading POST bodies. Limits are
two POST and four GET operations per Node process, 10-second body intake, 35-second POST upstream
work, 45-second total POST processing, 5-second reads/exports, and 4 MiB responses. Go remains the
product-validation authority.

Production requires explicit server-side `APP_ORIGIN` and `GO_API_URL`. Development alone has
loopback defaults. The root page uses a fresh nonce with dynamic rendering, strict script policy,
and self-hosted CSS. Development's extra eval allowance is excluded from the production policy.
The production build and browser behavior must be verified before claiming this configuration
works on the target runtime. Runtime values are not published through `NEXT_PUBLIC` configuration.

Shared design skills informed tokens, semantics, keyboard interaction, and feedback. Their generic
framework/layout suggestions do not supersede the approved native-control workbench. Accessibility
and security outcomes require actual verification; these notes do not claim formal conformance.
