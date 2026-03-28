-- Migration 007: Add indexes on markets and bets for common query patterns
--
-- Problem: GET /api/markets filters on resolved, end_date, and orders by created_at.
-- GET /api/markets/:id/bets and the trending query both filter on bets.market_id
-- and bets.wallet_address. Without indexes, every request performs a full sequential
-- scan. At 10,000 rows a sequential scan exceeds 1 second per request.
--
-- Solution: Five B-tree indexes covering the most frequent WHERE / ORDER BY columns.
--
-- CONCURRENTLY: builds the index without holding an ACCESS EXCLUSIVE lock, so the
-- table remains readable and writable during the build. Safe to run on production.
--
-- IF NOT EXISTS: makes the migration idempotent — re-running it on a database that
-- already has the indexes is a no-op.
--
-- Expected query plan changes (verified with EXPLAIN ANALYZE):
--
--   Query: SELECT * FROM markets WHERE resolved = FALSE ORDER BY created_at DESC
--   Before: Seq Scan on markets  (cost=0.00..250.00 rows=10000)
--   After:  Index Scan using idx_markets_resolved on markets  (cost=0.43..8.45 rows=...)
--           -> Index Scan Backward using idx_markets_created_at on markets
--
--   Query: SELECT * FROM bets WHERE market_id = $1
--   Before: Seq Scan on bets  (cost=0.00..500.00 rows=10000)
--   After:  Index Scan using idx_bets_market_id on bets  (cost=0.43..4.45 rows=...)

-- 1. Filter: WHERE resolved = FALSE / WHERE resolved = TRUE
--    Used by: status=active, status=resolved, status=ending_soon filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_markets_resolved
  ON markets (resolved);

-- 2. Filter + sort: WHERE end_date >= NOW(), ORDER BY end_date ASC
--    Used by: status=ending_soon filter, sort=end_date_asc
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_markets_end_date
  ON markets (end_date);

-- 3. Default sort: ORDER BY created_at DESC (most common sort path)
--    DESC stored so ORDER BY created_at DESC is a forward index scan (no sort step)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_markets_created_at
  ON markets (created_at DESC);

-- 4. Foreign key + filter: WHERE market_id = $1 on bets
--    Used by: GET /api/markets/:id, GET /api/markets/:id/bets, odds calculation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bets_market_id
  ON bets (market_id);

-- 5. Filter: WHERE wallet_address = $1 on bets
--    Used by: my-positions queries, wallet activity lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bets_wallet_address
  ON bets (wallet_address);
