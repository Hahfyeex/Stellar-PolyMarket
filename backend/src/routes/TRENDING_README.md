# Trending Markets Endpoint

## Endpoint

```
GET /api/markets/trending
```

Returns the top 10 markets by total bet volume in the last 24 hours. Used by the "Trending" section of the UI.

## Response

```json
{
  "fetched_at": "2026-03-25T10:00:00.000Z",
  "cached": false,
  "count": 10,
  "markets": [
    {
      "market_id": 42,
      "question": "Will BTC hit $100k by end of 2026?",
      "status": "ACTIVE",
      "resolved": false,
      "end_date": "2026-12-31T00:00:00.000Z",
      "bet_count": 312,
      "volume_24h": "158400.00"
    }
  ]
}
```

## Caching

Responses are cached in Redis for **5 minutes** (`CACHE_TTL_SECONDS = 300`). The `cached: true` flag is set on cache hits so clients can distinguish fresh vs. cached data.

## SQL Index

The query does a `GROUP BY market_id` with a `WHERE created_at >= NOW() - INTERVAL '24 hours'` filter on the `bets` table. Without an index this becomes a full table scan as bet volume grows.

Migration `002_trending_volume_index.sql` creates:

```sql
CREATE INDEX IF NOT EXISTS idx_bets_created_at_market_amount
  ON bets (created_at DESC, market_id, amount)
  WHERE created_at >= NOW() - INTERVAL '24 hours';
```

Why this index is fast:

- The `WHERE created_at >= NOW() - INTERVAL '24 hours'` clause is a **partial index** — it only indexes rows relevant to the query, keeping the index small.
- `(created_at DESC, market_id, amount)` covers the filter, the `GROUP BY`, and the `SUM(amount)` aggregation in a single index scan with no heap fetches for those columns.
- `ORDER BY volume_24h DESC LIMIT 10` is resolved after aggregation, so the index primarily accelerates the scan + group phase.

Run the migration once against your database:

```bash
psql $DATABASE_URL -f backend/src/db/migrations/002_trending_volume_index.sql
```
