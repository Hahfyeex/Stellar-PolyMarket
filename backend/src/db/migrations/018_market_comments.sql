-- Migration: create market_comments table and thumbs-up deduplication table
CREATE TABLE IF NOT EXISTS market_comments (
  id SERIAL PRIMARY KEY,
  market_id INT REFERENCES markets(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  content VARCHAR(500) NOT NULL,
  thumbs_up_count INT NOT NULL DEFAULT 0,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_comments_market_id ON market_comments(market_id, is_hidden, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_thumbs_up (
  comment_id INT REFERENCES market_comments(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, wallet_address)
);
