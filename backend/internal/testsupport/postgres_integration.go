//go:build integration

package testsupport

import (
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
)

func DatabaseURLs(t *testing.T) (string, string) {
	t.Helper()
	runtimeURL := os.Getenv("TEST_DATABASE_URL")
	migrationURL := os.Getenv("TEST_MIGRATION_DATABASE_URL")
	if runtimeURL == "" && migrationURL == "" {
		t.Skip("dedicated PostgreSQL integration database is not configured")
	}
	for _, entry := range []struct{ url, role string }{
		{url: runtimeURL, role: "catalog_runtime"}, {url: migrationURL, role: "catalog_migrator"},
	} {
		cfg, err := pgx.ParseConfig(entry.url)
		if err != nil || entry.url == "" {
			t.Fatal("the explicit integration database configuration is invalid")
		}
		local := cfg.Host == "127.0.0.1" || cfg.Host == "localhost" || cfg.Host == "::1"
		if cfg.Database != "catalog_integration" || cfg.User != entry.role || !local {
			t.Fatal("integration tests require the dedicated local catalog_integration database and roles")
		}
	}
	return runtimeURL, migrationURL
}
