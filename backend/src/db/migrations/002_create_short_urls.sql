-- Migration: Create short_urls table for market share URI shortener
CREATE TABLE IF NOT EXISTS short_urls (
  id SERIAL PRIMARY KEY,
  short_code VARCHAR(6) NOT NULL UNIQUE,
  market_id INT NOT NULL REFERENCES markets(id),
  full_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_short_urls_short_code ON short_urls(short_code);
CREATE INDEX IF NOT EXISTS idx_short_urls_market_id ON short_urls(market_id);
