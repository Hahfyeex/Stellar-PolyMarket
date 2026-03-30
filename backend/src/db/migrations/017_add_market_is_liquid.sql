-- Add a flag indicating whether a market is considered liquid (total pool >= threshold)
ALTER TABLE markets ADD COLUMN IF NOT EXISTS is_liquid BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing markets from default threshold used in the app
UPDATE markets SET is_liquid = (total_pool >= 10);
