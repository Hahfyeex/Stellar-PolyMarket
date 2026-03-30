-- Market Comments Table
CREATE TABLE IF NOT EXISTS market_comments (
    id SERIAL PRIMARY KEY,
    market_id INTEGER NOT NULL REFERENCES markets(id),
    wallet_address TEXT NOT NULL,
    text TEXT NOT NULL CHECK (char_length(text) <= 500),
    thumbs_up_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_comments_market_id ON market_comments (market_id);
