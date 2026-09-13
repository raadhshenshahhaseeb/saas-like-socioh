# Authenticated hosted preview

[compose.coolify.yaml](../compose.coolify.yaml) deploys the **current unauthenticated CSV slice**
behind a required private-preview access gate. It does not implement the specified owner login,
membership policy, connected sources or mock publication. Those remain separate product work.
This definition is independent of native helpers, legacy ownership records and local environment files.

## Required private configuration

Use the deployment platform's private configuration. [`.env.example`](.env.example) documents
placeholders, not working credentials. Do not load it into the native root `.env` or commit real values.

| Setting | Required meaning |
|---|---|
| `POSTGRES_ADMIN_PASSWORD` | Independent administrator secret, 32–128 base64url-safe characters |
| `POSTGRES_MIGRATOR_PASSWORD` | Independent migration-role secret in the same format |
| `POSTGRES_RUNTIME_PASSWORD` | Independent least-privileged runtime secret in the same format |
| `APP_ORIGIN` | Exact approved HTTPS origin, without credentials, a path, query or fragment |
| `AUTH_NAMESPACE` | Unique lowercase router/image-safe namespace; non-secret metadata available during build and runtime |
| `HTTPS_ROUTER_NAME` | Exact generated frontend HTTPS router name, verified in the saved platform configuration |
| `PREVIEW_AUTH_USERS` | Private `username:bcrypt-hash` access entry, not plaintext credentials |

Missing values stop Compose interpolation. Nonempty but incorrect router names do **not** establish
access protection: the operator must verify the effective router and unauthenticated responses before
exposing or announcing the preview. Preserve bcrypt dollar signs through the platform's rendering;
do not paste a hash into source, screenshots, logs, build arguments or public deployment evidence.
The frontend receives no working database or preview credential values in its environment.
The bcrypt hash is necessarily present in its private Docker middleware labels; restrict Docker and
deployment-configuration access accordingly. Disable automatic secret-to-build-argument injection.

Some Coolify versions inject a shared runtime `env_file` into every service and refill empty values
from saved application variables. The fixed `not-used-in-this-service` values intentionally override
unrelated credentials on non-owning services. This sentinel is not a valid configured password or
bcrypt entry. Keep each Go service's required DSN; never replace the sentinel with an empty string,
null, interpolation or working password. This protects the current documented credential set,
not arbitrary future variables. Whenever adding a secret, update its service scopes and verify both
the generated Compose and actual container environments. Docker's `environment` values take
precedence over `env_file`; confirm the platform preserves the literal sentinels.

The app-specific middleware chain also bounds pre-authentication work: five requests per second
with a burst of 30, and at most 20 concurrent requests. A preceding middleware overwrites the
grouping header with a fixed non-secret value, so callers cannot select fresh limiter buckets using
their own header, address or host spelling. Preserve the order: scope header, rate limit, in-flight
limit, authentication. These are conservative single-proxy preview defaults, not a measured CPU
budget, per-user fairness policy or distributed denial-of-service protection. Check normal page
assets and catalog actions after changes; do not run a production saturation test.

## Services and initialization

The four services are `database`, `migrate`, `backend` and `frontend`. There are no host-port
publications, fixed container/network names or externally pre-created volumes. The persistent
`catalog-data` volume is scoped to the deployment project; preserve its project identity across updates.

The PostgreSQL image retains the local image's pinned major/platform and distribution patch. For a
new empty volume, [postgres-init.sh](postgres-init.sh) creates the exact `catalog_migrator` and
`catalog_runtime` roles, gives the migrator database ownership and restricts runtime privileges.
Passwords enter psql through `\getenv` and SQL-literal quoting, never shell evaluation or arguments.
TCP health remains unavailable during the temporary initialization server, preventing an early
migration attempt. Initialization is not rerun on a normal restart. An existing volume with different
credentials or incomplete initialization needs explicit recovery, never automatic deletion or rotation.

The one-off migration service runs `/catalog migrate up` from the same backend source/Dockerfile.
It receives only migration credentials, waits for PostgreSQL health and must exit successfully before
the backend starts. Runtime Go receives only runtime credentials; Next receives only the approved
application origin and private backend origin. Current migration checksum and workspace/role readiness
checks remain active. No reset command is part of deployment.

## Platform configuration and release gate

1. Select the approved repository/branch, repository-root build context and `compose.coolify.yaml`.
   Confirm the intended source revision; do not infer it from an application name.
   Set the custom build command to
   `docker compose --project-name <verified-project-name> -f compose.build.yaml build --pull`,
   replacing the placeholder only in private platform configuration.
   The separate [build-only definition](../compose.build.yaml) uses the same service and project
   identities without parsing runtime environments, labels or secrets. Enable build and runtime
   availability for non-secret `AUTH_NAMESPACE` only; the other six keys stay runtime-only.
   Explicit image names match in both definitions and prevent platform-generated tag divergence.
   Use the same project identity at startup. Verify resulting image tags and the
   effective command; do not enable secret build arguments to fix a Compose interpolation error.
   Keep the default runtime start command and the runtime Compose location unchanged.
   The locally scoped `latest` tags are mutable: record actual image IDs with each source revision
   and rebuild the chosen source for rollback instead of treating a tag as immutable evidence.
2. Configure only the frontend domain, targeting its internal port 3000. Do not assign domains or
   proxy routes to database, migration or backend services. Inspect effective private-network membership.
   Managed Compose can add a shared application network to all services: do not assume the separate
   source networks provide strict frontend-to-database segmentation after platform generation.
3. Verify `HTTPS_ROUTER_NAME` and the final router middleware chain includes both `gzip` and the
   namespaced preview-auth middleware. `removeheader=true` strips preview credentials before forwarding.
   Require HTTPS; protect or remove every alternate/generated URL. HTTP may redirect only to the protected
   HTTPS endpoint. Unknown credentials and absent credentials must not reach HTML, assets, APIs or exports.
4. Use **one Go instance with stop-before-start replacement**. Before migration/replacement, stop the
   previous Go instance and drain its requests. A new instance repairs interrupted runs at startup;
   overlapping instances can invalidate active work. A dependency declaration alone does not establish
   the platform's replacement behavior. Verify this explicitly before deploying.
5. Ensure the one-off migration executes for the intended deployment and its nonzero exit blocks the
   backend. Do not let a previously completed migration container substitute for required new migration
   work. Verify the platform's lifecycle and resulting container states.
6. Verify authenticated sample/upload/preview/download, invalid input and persistence after a controlled
   restart. Check unauthenticated denial separately on all available routes. Keep source-to-running-revision,
   migration, image and rollback evidence private. Do not claim revised owner-journey acceptance from this.

The manifest uses Coolify's documented `exclude_from_hc: true` service extension for the migration
job. Raw Docker Compose rejects that platform-only key. A local validation projection may remove
**only that key** and disable Traefik on a separately owned disposable stack; do not claim the raw
manifest passed a stock Compose parser. The platform must preserve successful one-off dependency
semantics and exclude the exited migration job from ongoing application health.

## Data, recovery and limits

Keep all database containers/volumes and credentials intact during application replacement. Back up
before schema or infrastructure changes; no automated rollback can recreate discarded database data.
Rollback means selecting the previously verified source/image configuration and restoring compatible
data only through an approved recovery procedure. Changing environment values does not rotate stored
database passwords. Never use this hosted definition to target an existing local demonstration volume.

This remains a bounded, synthetic-data preview, not a production security certification. Existing
resource limits, read-only app filesystems, dropped capabilities, health checks and bounded logs remain.
Residual image findings are qualified in [the security record](../docs/security.md); refresh relevant
checks for the actual deployed images. Public exposure without the verified auth gate is not authorized.

Reference behavior: [Coolify Compose build packs](https://coolify.io/docs/applications/build-packs/docker-compose),
[Traefik BasicAuth](https://doc.traefik.io/traefik/v3.4/reference/routing-configuration/http/middlewares/basicauth/),
and [PostgreSQL 17 psql](https://www.postgresql.org/docs/17/app-psql.html).
