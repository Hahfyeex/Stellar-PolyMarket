-- Dead-letter queue for markets that failed automated resolution after all retries
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id SERIAL PRIMARY KEY,
  market_id INT REFERENCES markets(id),
  oracle_type TEXT NOT NULL,
  error TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add category column to markets for oracle routing
ALTER TABLE markets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
