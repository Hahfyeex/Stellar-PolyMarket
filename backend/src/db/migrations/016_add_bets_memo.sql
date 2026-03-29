-- Add memo field to store transaction memo for audit and verification
ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS memo TEXT;
