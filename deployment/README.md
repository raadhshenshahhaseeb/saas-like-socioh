# Authenticated hosted preview

[compose.coolify.yaml](../compose.coolify.yaml) deploys the **current unauthenticated CSV slice**
behind a required private-preview access gate. It does not implement the specified owner login,
membership policy, connected sources or mock publication. Those remain separate product work.
This definition is independent of native helpers, legacy ownership records and local environment files.

## Required private configuration

Use the deployment platform's private runtime variables. [`.env.example`](.env.example) documents
placeholders, not working credentials. Do not load it into the native root `.env` or commit real values.

| Setting | Required meaning |
|---|---|
| `POSTGRES_ADMIN_PASSWORD` | Independent administrator secret, 32–128 base64url-safe characters |
| `POSTGRES_MIGRATOR_PASSWORD` | Independent migration-role secret in the same format |
| `POSTGRES_RUNTIME_PASSWORD` | Independent least-privileged runtime secret in the same format |
| `APP_ORIGIN` | Exact approved HTTPS origin, without credentials, a path, query or fragment |
| `AUTH_NAMESPACE` | Unique router-safe namespace for this application's custom auth middleware |
| `HTTPS_ROUTER_NAME` | Exact generated frontend HTTPS router name, verified in the saved platform configuration |
| `PREVIEW_AUTH_USERS` | Private `username:bcrypt-hash` access entry, not plaintext credentials |

Missing values stop Compose interpolation. Nonempty but incorrect router names do **not** establish
access protection: the operator must verify the effective router and unauthenticated responses before
exposing or announcing the preview. Preserve bcrypt dollar signs through the platform's rendering;
do not paste a hash into source, screenshots, logs, build arguments or public deployment evidence.
The frontend receives no database credentials or preview credential variables in its environment.
The bcrypt hash is necessarily present in its private Docker middleware labels; restrict Docker and
deployment-configuration access accordingly. Disable automatic secret-to-build-argument injection.

Some Coolify versions inject a shared runtime `env_file` into every service. The explicit empty
credential values in this manifest override that file on non-owning services; they are intentional,
not missing configuration. Keep each Go service's required DSN, but do not replace empty values
with null, interpolation or working passwords. This protects the current documented credential set,
not arbitrary future variables. Whenever adding a secret, update its service scopes and verify both
the generated Compose and actual container environments. Docker's `environment` values take
precedence over `env_file`; confirm the platform preserves the empty strings.

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
