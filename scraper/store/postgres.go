// Package store provides PostgreSQL storage for scraped ledger events.
package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

// Event represents a single contract event extracted from a ledger operation.
type Event struct {
	LedgerSeq int64
	TxHash    string
	EventType string
	Data      json.RawMessage
	Timestamp time.Time
	CreatedAt time.Time
}

// Store wraps a PostgreSQL connection and provides methods for persisting
// scraped events and tracking scraper progress.
type Store struct {
	db *sql.DB
}

// New opens a PostgreSQL connection and ensures the required tables exist.
func New(databaseURL string) (*Store, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate database: %w", err)
	}

	return s, nil
}

// NewWithDB creates a Store using an existing *sql.DB connection.
// This is useful for testing with mock databases.
func NewWithDB(db *sql.DB) *Store {
	return &Store{db: db}
}

// migrate creates the required tables if they do not already exist.
func (s *Store) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS ledger_events (
		id          BIGSERIAL PRIMARY KEY,
		ledger_seq  BIGINT      NOT NULL,
		tx_hash     TEXT        NOT NULL,
		event_type  TEXT        NOT NULL,
		data        JSONB       NOT NULL DEFAULT '{}',
		timestamp   TIMESTAMPTZ NOT NULL,
		created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_ledger_events_ledger_seq ON ledger_events (ledger_seq);
	CREATE INDEX IF NOT EXISTS idx_ledger_events_event_type ON ledger_events (event_type);
	CREATE INDEX IF NOT EXISTS idx_ledger_events_tx_hash    ON ledger_events (tx_hash);

	CREATE TABLE IF NOT EXISTS scraper_state (
		id                  INT PRIMARY KEY DEFAULT 1,
		last_processed_ledger BIGINT NOT NULL DEFAULT 0,
		updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		CONSTRAINT single_row CHECK (id = 1)
	);

	INSERT INTO scraper_state (id, last_processed_ledger)
	VALUES (1, 0)
	ON CONFLICT (id) DO NOTHING;
	`

	_, err := s.db.Exec(schema)
	return err
}

// SaveEvent inserts a new event record into the ledger_events table.
func (s *Store) SaveEvent(e *Event) error {
	query := `
		INSERT INTO ledger_events (ledger_seq, tx_hash, event_type, data, timestamp)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := s.db.Exec(query, e.LedgerSeq, e.TxHash, e.EventType, e.Data, e.Timestamp)
	if err != nil {
		return fmt.Errorf("save event: %w", err)
	}
	return nil
}

// SaveEvents inserts multiple events in a single transaction.
func (s *Store) SaveEvents(events []*Event) error {
	if len(events) == 0 {
		return nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	stmt, err := tx.Prepare(`
		INSERT INTO ledger_events (ledger_seq, tx_hash, event_type, data, timestamp)
		VALUES ($1, $2, $3, $4, $5)
	`)
	if err != nil {
		return fmt.Errorf("prepare statement: %w", err)
	}
	defer stmt.Close()

	for _, e := range events {
		if _, err := stmt.Exec(e.LedgerSeq, e.TxHash, e.EventType, e.Data, e.Timestamp); err != nil {
			return fmt.Errorf("insert event (ledger %d, tx %s): %w", e.LedgerSeq, e.TxHash, err)
		}
	}

	return tx.Commit()
}

// GetLastProcessedLedger returns the last ledger sequence that was fully processed.
func (s *Store) GetLastProcessedLedger() (int64, error) {
	var seq int64
	err := s.db.QueryRow("SELECT last_processed_ledger FROM scraper_state WHERE id = 1").Scan(&seq)
	if err != nil {
		return 0, fmt.Errorf("get last processed ledger: %w", err)
	}
	return seq, nil
}

// UpdateLastProcessedLedger persists the most recently completed ledger sequence.
func (s *Store) UpdateLastProcessedLedger(seq int64) error {
	_, err := s.db.Exec(
		"UPDATE scraper_state SET last_processed_ledger = $1, updated_at = NOW() WHERE id = 1",
		seq,
	)
	if err != nil {
		return fmt.Errorf("update last processed ledger: %w", err)
	}
	return nil
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}
