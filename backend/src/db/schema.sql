CREATE TABLE IF NOT EXISTS markets (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  outcomes TEXT[] NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  winning_outcome INT,
  total_pool NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bets (
  id SERIAL PRIMARY KEY,
  market_id INT REFERENCES markets(id),
  wallet_address TEXT NOT NULL,
  outcome_index INT NOT NULL,
  amount NUMERIC NOT NULL,
  paid_out BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
