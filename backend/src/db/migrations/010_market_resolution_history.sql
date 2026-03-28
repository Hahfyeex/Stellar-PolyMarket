CREATE TABLE IF NOT EXISTS market_resolution_history (
  id           SERIAL PRIMARY KEY,
  market_id    INT NOT NULL REFERENCES markets(id),
  action       TEXT NOT NULL CHECK (action IN ('PROPOSED', 'CONFIRMED', 'REJECTED', 'DISPUTED')),
  actor_wallet TEXT,
  outcome_index INT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mrh_market_id ON market_resolution_history(market_id, created_at);
