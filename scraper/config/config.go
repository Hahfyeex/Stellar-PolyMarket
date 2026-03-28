// Package config provides environment-based configuration for the ledger event scraper.
package config

import (
	"fmt"
	"os"
	"strconv"
)

const (
	defaultHorizonURL  = "https://horizon-testnet.stellar.org"
	defaultWorkerCount = 10
	defaultPollInterval = 5 // seconds
)

// Config holds all configuration values for the scraper service.
type Config struct {
	// HorizonURL is the Stellar Horizon API endpoint.
	HorizonURL string

	// DatabaseURL is the PostgreSQL connection string.
	DatabaseURL string

	// ContractAddress is the Soroban contract address to filter events for.
	ContractAddress string

	// WorkerCount is the number of concurrent goroutines for processing ledgers.
	WorkerCount int

	// PollIntervalSec is how many seconds to wait before polling for new ledgers.
	PollIntervalSec int
}

// Load reads configuration from environment variables, applying sensible defaults
// where possible. It returns an error if required values (DATABASE_URL) are missing.
func Load() (*Config, error) {
	cfg := &Config{
		HorizonURL:      envOrDefault("HORIZON_URL", defaultHorizonURL),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		ContractAddress: os.Getenv("CONTRACT_ADDRESS"),
		WorkerCount:     envIntOrDefault("WORKER_COUNT", defaultWorkerCount),
		PollIntervalSec: envIntOrDefault("POLL_INTERVAL_SEC", defaultPollInterval),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}

	if cfg.WorkerCount < 1 {
		cfg.WorkerCount = defaultWorkerCount
	}

	return cfg, nil
}

// envOrDefault returns the value of the named environment variable, or fallback
// if the variable is empty or unset.
func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envIntOrDefault returns the integer value of the named environment variable,
// or fallback if the variable is empty, unset, or not a valid integer.
func envIntOrDefault(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
