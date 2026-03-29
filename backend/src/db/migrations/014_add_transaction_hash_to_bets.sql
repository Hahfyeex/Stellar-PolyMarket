-- Migration: Store transaction hash in bets for tax reporting
ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS transaction_hash TEXT;

-- Index for tax export queries
CREATE INDEX IF NOT EXISTS idx_bets_wallet_created_at ON bets (wallet_address, created_at);
