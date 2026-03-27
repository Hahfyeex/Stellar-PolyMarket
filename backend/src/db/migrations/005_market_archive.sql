-- Migration: create archived_markets table
-- Archive table mirrors markets schema with an additional archived_at timestamp.

CREATE TABLE IF NOT EXISTS archived_markets (
  id INT PRIMARY KEY,
  question TEXT NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  outcomes TEXT[] NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  winning_outcome INT,
  total_pool NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  contract_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for date-range queries on the archive endpoint
CREATE INDEX IF NOT EXISTS idx_archived_markets_archived_at ON archived_markets (archived_at);
