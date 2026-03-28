-- Create failed_notifications table to store notifications that could not be inserted into the main notifications table
CREATE TABLE IF NOT EXISTS failed_notifications (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT,
  market_id INT REFERENCES markets(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for debugging/retries
CREATE INDEX IF NOT EXISTS idx_failed_notifications_market_id ON failed_notifications(market_id);
CREATE INDEX IF NOT EXISTS idx_failed_notifications_wallet ON failed_notifications(wallet_address);
