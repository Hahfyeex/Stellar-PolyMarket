-- Add fee_rate_bps to market records to use dynamic contract fee
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS fee_rate_bps INTEGER NOT NULL DEFAULT 300;
