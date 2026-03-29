-- Tracks markets that were auto-expired by the cleanup job for the daily admin digest
CREATE TABLE IF NOT EXISTS expired_markets_digest (
  id         SERIAL PRIMARY KEY,
  market_id  INT NOT NULL REFERENCES markets(id),
  question   TEXT NOT NULL,
  expired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expired_markets_digest_expired_at
  ON expired_markets_digest (expired_at);
