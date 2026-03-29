-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  icon_name VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with initial categories
INSERT INTO categories (name, slug, icon_name) VALUES
  ('Sports', 'sports', 'sports-icon'),
  ('Crypto', 'crypto', 'crypto-icon'),
  ('Finance', 'finance', 'finance-icon'),
  ('Politics', 'politics', 'politics-icon'),
  ('Weather', 'weather', 'weather-icon'),
  ('Entertainment', 'entertainment', 'entertainment-icon')
ON CONFLICT (slug) DO NOTHING;

-- Add category_id to markets table
ALTER TABLE markets ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);
