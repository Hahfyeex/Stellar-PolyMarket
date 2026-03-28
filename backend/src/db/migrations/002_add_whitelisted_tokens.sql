-- Migration: Create whitelisted_tokens table for collateral asset whitelisting.
-- Only tokens present in this table may be used as collateral for bets.
CREATE TABLE IF NOT EXISTS whitelisted_tokens (
  id SERIAL PRIMARY KEY,
  token_address TEXT NOT NULL UNIQUE,
  symbol TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default whitelisted tokens (XLM, USDC, ARST)
INSERT INTO whitelisted_tokens (token_address, symbol) VALUES
  ('native', 'XLM'),
  ('CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', 'USDC'),
  ('CARST3VNQHK4HKFQG3JYEAISMKAYHT7OABPGCF7Y7BWIV3MRZDRQSW2', 'ARST')
ON CONFLICT (token_address) DO NOTHING;
