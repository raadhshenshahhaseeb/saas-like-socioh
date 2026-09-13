package config_test

import (
	"testing"
	"time"

	"example.com/catalog-workflow/backend/internal/config"
)

func TestLoad(t *testing.T) {
	t.Run("bounded defaults need no process environment mutation", func(t *testing.T) {
		cfg, err := config.Load(func(string) string { return "" })
		if err != nil {
			t.Fatal(err)
		}
		if cfg.PostSlots != 2 || cfg.ReadSlots != 4 || cfg.MaxStoredRuns != 100 || cfg.PostTimeout != 30*time.Second {
			t.Fatal("incorrect processing defaults")
		}
		if cfg.Address != "127.0.0.1:8080" || cfg.WorkspaceID != config.DemoWorkspaceID {
			t.Fatal("incorrect local demo scope")
		}
	})
	for _, value := range []string{"0", "101", "-1", "invalid"} {
		t.Run("reject invalid stored run limit "+value, func(t *testing.T) {
			_, err := config.Load(func(key string) string {
				if key == "MAX_STORED_RUNS" {
					return value
				}
				return ""
			})
			if err == nil {
				t.Fatal("invalid stored run limit accepted")
			}
		})
	}
}
