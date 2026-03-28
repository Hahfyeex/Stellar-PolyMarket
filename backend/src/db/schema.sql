CREATE TABLE IF NOT EXISTS markets (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  outcomes TEXT[] NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  winning_outcome INT,
  total_pool NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE',
  category TEXT DEFAULT 'general',
  contract_address TEXT,
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

CREATE TABLE IF NOT EXISTS user_notifications (
  wallet_address TEXT PRIMARY KEY,
  fcm_token TEXT NOT NULL,
  preferences JSONB DEFAULT '{"market_proposed": true, "market_resolved": true}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Governance: disputes submitted for council review
CREATE TABLE IF NOT EXISTS governance_disputes (
  id SERIAL PRIMARY KEY,
  market_id INT REFERENCES markets(id),
  proposed_outcome TEXT NOT NULL,
  dispute_reason TEXT NOT NULL,
  evidence JSONB DEFAULT '[]'::jsonb,  -- [{ label, url, type }]
  quorum_required INT NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'active', -- active | resolved | expired
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Governance: one vote per council member per dispute
CREATE TABLE IF NOT EXISTS governance_votes (
  id SERIAL PRIMARY KEY,
  dispute_id INT REFERENCES governance_disputes(id),
  wallet_address TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('yes', 'no')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (dispute_id, wallet_address)
);

-- Oracle price audit log — records all source values, outliers, and median per aggregation run
CREATE TABLE IF NOT EXISTS oracle_price_log (
  id               SERIAL PRIMARY KEY,
  asset            TEXT NOT NULL,                  -- e.g. 'BTC/USD'
  fetched_at       TIMESTAMPTZ NOT NULL,           -- when sources were queried
  source_values    NUMERIC[] NOT NULL,             -- raw values from all valid sources
  outliers         NUMERIC[] NOT NULL DEFAULT '{}', -- values rejected by outlier filter
  filtered_values  NUMERIC[] NOT NULL,             -- values used to compute median
  median_value     NUMERIC NOT NULL,               -- final aggregated price
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
