-- Migration: Add unique constraint for duplicate bet prevention (#376)
ALTER TABLE bets ADD CONSTRAINT IF NOT EXISTS unique_bet_per_wallet_per_market UNIQUE (market_id, wallet_address);
