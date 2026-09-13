package config

import (
	"errors"
	"net"
	"strconv"
	"time"
)

const DemoWorkspaceID = "11111111-1111-4111-8111-111111111111"

type Config struct {
	Address              string
	DatabaseURL          string
	MigrationDatabaseURL string
	DemoDatabaseName     string
	WorkspaceID          string
	MaxStoredRuns        int
	PostSlots            int
	ReadSlots            int
	PostTimeout          time.Duration
	ReadTimeout          time.Duration
	BodyTimeout          time.Duration
	CleanupTimeout       time.Duration
	AcquireTimeout       time.Duration
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Address: "127.0.0.1:8080", DatabaseURL: getenv("DATABASE_URL"),
		MigrationDatabaseURL: getenv("MIGRATION_DATABASE_URL"), DemoDatabaseName: getenv("DEMO_DATABASE_NAME"),
		WorkspaceID: DemoWorkspaceID, MaxStoredRuns: 100, PostSlots: 2, ReadSlots: 4,
		PostTimeout: 30 * time.Second, ReadTimeout: 5 * time.Second, BodyTimeout: 10 * time.Second,
		CleanupTimeout: 2 * time.Second, AcquireTimeout: 2 * time.Second,
	}
	if value := getenv("APP_ADDR"); value != "" {
		cfg.Address = value
	}
	if cfg.DemoDatabaseName == "" {
		cfg.DemoDatabaseName = "catalog_demo"
	}
	if value := getenv("MAX_STORED_RUNS"); value != "" {
		limit, err := strconv.Atoi(value)
		if err != nil || limit < 1 || limit > 100 {
			return Config{}, errors.New("MAX_STORED_RUNS must be between 1 and 100")
		}
		cfg.MaxStoredRuns = limit
	}
	_, port, err := net.SplitHostPort(cfg.Address)
	if err != nil {
		return Config{}, errors.New("APP_ADDR must contain a host and port")
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return Config{}, errors.New("APP_ADDR requires a valid port")
	}
	return cfg, nil
}
