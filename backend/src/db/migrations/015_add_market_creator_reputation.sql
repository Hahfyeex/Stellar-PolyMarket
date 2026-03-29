-- Migration: 015_add_market_creator_reputation.sql  
-- Adds creator reputation tracking system  

ALTER TABLE markets ADD COLUMN IF NOT EXISTS creator_wallet VARCHAR(56);  

CREATE TABLE IF NOT EXISTS market_creators (  
  wallet_address VARCHAR(56) PRIMARY KEY,  
  markets_created INT NOT NULL DEFAULT 0,  
  markets_resolved_correctly INT NOT NULL DEFAULT 0,  
  markets_disputed INT NOT NULL DEFAULT 0,  
  markets_voided INT NOT NULL DEFAULT 0,  
  reputation_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (reputation_score BETWEEN 0 AND 100),  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()  
);  

CREATE INDEX IF NOT EXISTS idx_markets_creator_wallet ON markets(creator_wallet) WHERE creator_wallet IS NOT NULL;  
CREATE INDEX IF NOT EXISTS idx_market_creators_updated ON market_creators(updated_at);  

-- Backfill existing markets? Skip - new feature, assume fresh creator_wallet nulls don't count

