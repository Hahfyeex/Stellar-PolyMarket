-- Migration: Add composite index to support the trending markets query
--
-- The GET /api/markets/trending endpoint runs:
--   SELECT market_id, SUM(amount), COUNT(id)
--   FROM bets
--   WHERE created_at >= NOW() - INTERVAL '24 hours'
--   GROUP BY market_id
--   ORDER BY SUM(amount) DESC
--   LIMIT 10
--
-- Without an index, Postgres performs a full sequential scan of the bets table.
-- This composite index on (created_at, market_id, amount) lets Postgres:
--   1. Use an index range scan to filter rows in the 24-hour window (created_at).
--   2. Read market_id and amount directly from the index (index-only scan),
--      avoiding heap fetches entirely once the visibility map is up to date.
--
-- BRIN is NOT used here because bets are inserted roughly in time order but
-- the table will grow large; a B-tree on created_at gives precise range scans.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bets_trending
  ON bets (created_at DESC, market_id, amount);
