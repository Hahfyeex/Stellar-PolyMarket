-- Mercury Indexer schema extension
-- Adds events and users tables; adds indexes for fast query performance

-- Raw contract events ingested from Mercury Indexer
CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  -- Soroban contract that emitted the event
  contract_id TEXT        NOT NULL,
  -- Event topic (e.g. "Bet", "MarketCreated", "MarketResolved")
  topic       TEXT        NOT NULL,
  -- Full event payload as JSON (parsed from XDR)
  payload     JSONB       NOT NULL DEFAULT '{}',
  -- Ledger sequence number the event appeared in
  ledger_seq  BIGINT      NOT NULL,
  -- Ledger close time (Unix timestamp)
  ledger_time TIMESTAMPTZ NOT NULL,
  -- Prevent duplicate ingestion of the same event
  tx_hash     TEXT        NOT NULL,
  event_index INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tx_hash, event_index)
);

-- Aggregated per-wallet stats (upserted on every Bet event)
CREATE TABLE IF NOT EXISTS users (
  wallet_address TEXT        PRIMARY KEY,
  -- Total XLM staked across all markets
  total_staked   NUMERIC     NOT NULL DEFAULT 0,
  -- Total XLM won across all resolved markets
  total_won      NUMERIC     NOT NULL DEFAULT 0,
  -- Number of bets placed
  bet_count      INT         NOT NULL DEFAULT 0,
  -- Number of winning bets
  win_count      INT         NOT NULL DEFAULT 0,
  first_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add category column to markets if not already present (from resolver migration)
ALTER TABLE markets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- ── Indexes for query performance ─────────────────────────────────────────────

-- Bet history: filter by market or wallet
CREATE INDEX IF NOT EXISTS idx_bets_market_id       ON bets (market_id);
CREATE INDEX IF NOT EXISTS idx_bets_wallet_address  ON bets (wallet_address);
CREATE INDEX IF NOT EXISTS idx_bets_created_at      ON bets (created_at DESC);

-- Event log: filter by contract + topic, sort by time
CREATE INDEX IF NOT EXISTS idx_events_contract_topic ON events (contract_id, topic);
CREATE INDEX IF NOT EXISTS idx_events_ledger_time    ON events (ledger_time DESC);

-- Market lookups
CREATE INDEX IF NOT EXISTS idx_markets_status       ON markets (status);
CREATE INDEX IF NOT EXISTS idx_markets_created_at   ON markets (created_at DESC);
