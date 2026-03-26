# Automated Market Resolver

Cron-based worker that automatically resolves expired prediction markets using oracle data.

## How It Works

1. Every 5 minutes the cron job queries for markets where `end_date <= NOW() AND resolved = false`
2. Each market is routed to the appropriate oracle based on its `category`
3. Oracle calls are retried up to 3 times with exponential backoff (1s → 2s → 4s)
4. After 3 failures the market is inserted into `dead_letter_queue` for manual review
5. Successful resolutions update `markets.resolved = true` and set `winning_outcome`

## Supported Oracle Types

| Category | Oracle | Data Source |
|---|---|---|
| `crypto` | Price feed | CoinGecko API |
| `economics` | Price feed | CoinGecko API |
| `sports` | Sports result | API-Football v3 |
| `football` | Sports result | API-Football v3 |

## Adding a New Oracle

1. Create `backend/src/oracles/myoracle.js` and export `async resolve(market) → number`
2. Register it in `backend/src/oracles/index.js`:
   ```js
   const myOracle = require('./myoracle');
   const REGISTRY = { ..., mycategory: myOracle };
   ```

## Environment Variables

| Variable | Description |
|---|---|
| `COINGECKO_URL` | CoinGecko base URL (default: `https://api.coingecko.com/api/v3`) |
| `SPORTS_API_URL` | API-Football base URL (default: `https://v3.football.api-sports.io`) |
| `SPORTS_API_KEY` | API-Football key |
| `JWT_SECRET` | Secret for signing admin JWT tokens |

## Admin Override

```
POST /api/admin/markets/:id/resolve
Authorization: Bearer <JWT>
Body: { "winning_outcome": 0 }
```

```
GET /api/admin/dead-letter
Authorization: Bearer <JWT>
```

## Dead-Letter Queue

Failed markets are stored in `dead_letter_queue` with the error message and attempt count. Query them via the admin endpoint or directly:

```sql
SELECT * FROM dead_letter_queue ORDER BY created_at DESC;
```
