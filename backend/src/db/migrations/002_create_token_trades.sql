-- Migration: Secondary market position-token trade history
-- Indexes Mint/Burn events from the Soroban contract to track
-- position token prices for the secondary market price aggregator.

CREATE TABLE IF NOT EXISTS token_trades (
  id            BIGSERIAL PRIMARY KEY,
  token_id      TEXT        NOT NULL,          -- "<market_id>-<outcome_index>"
  market_id     TEXT        NOT NULL,
  outcome_index INT         NOT NULL,
  event_type    TEXT        NOT NULL CHECK (event_type IN ('mint', 'burn')),
  price_xlm     NUMERIC(20, 7) NOT NULL,       -- price per token in XLM (stroops / 1e7)
  volume        NUMERIC(20, 7) NOT NULL,       -- number of tokens minted/burned
  wallet_address TEXT       NOT NULL,
  ledger        BIGINT      NOT NULL,
  tx_hash       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups for VWAP queries (24-hour window)
CREATE INDEX IF NOT EXISTS idx_token_trades_token_id_created_at
  ON token_trades (token_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_trades_created_at
  ON token_trades (created_at DESC);
