#!/bin/sh
# The official PostgreSQL entrypoint runs this only for a new, empty data volume.
set -eu

if [ "${POSTGRES_USER:-}" != postgres ] || [ "${POSTGRES_DB:-}" != catalog_demo ]; then
    printf '%s\n' 'Catalog initialization requires the documented administrator and database.' >&2
    exit 1
fi

# URL-safe values keep the separately constructed application connection URIs unambiguous.
# Never print, evaluate, or pass passwords as command-line arguments.
for credential in "${POSTGRES_PASSWORD:-}" "${POSTGRES_MIGRATOR_PASSWORD:-}" "${POSTGRES_RUNTIME_PASSWORD:-}"; do
    case "$credential" in
        ''|*[!A-Za-z0-9_-]*)
            printf '%s\n' 'Database credentials must use the documented URL-safe format.' >&2
            exit 1
            ;;
    esac
    if [ "${#credential}" -lt 32 ] || [ "${#credential}" -gt 128 ]; then
        printf '%s\n' 'Database credential length is outside the documented range.' >&2
        exit 1
    fi
done
unset credential

psql --no-psqlrc --username postgres --dbname catalog_demo --set ON_ERROR_STOP=1 <<'SQL'
\set ECHO none
\set VERBOSITY terse
\getenv migrator_password POSTGRES_MIGRATOR_PASSWORD
\getenv runtime_password POSTGRES_RUNTIME_PASSWORD
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
BEGIN;
CREATE ROLE catalog_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
CREATE ROLE catalog_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'runtime_password';
ALTER DATABASE catalog_demo OWNER TO catalog_migrator;
REVOKE ALL ON DATABASE catalog_demo FROM PUBLIC;
GRANT CONNECT ON DATABASE catalog_demo TO catalog_runtime;
COMMIT;
SQL
