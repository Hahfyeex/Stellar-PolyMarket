# Secondary Market — Position Token Price Aggregator

## Overview

Implements `GET /api/tokens/:token_id/price` — a 24-hour VWAP price feed for
position tokens traded on the secondary market (Issue #73).

---

## Indexing Strategy

### Event Source

The Soroban prediction market contract emits two events whenever a position
token changes hands:

| Event  | Trigger                                      |
|--------|----------------------------------------------|
| `mint` | User buys a position (tokens created)        |
| `burn` | User sells / redeems a position (tokens destroyed) |

### Worker: `token-price-indexer.js`

`backend/src/workers/token-price-indexer.js` polls the Soroban RPC every 4 s
(configurable via `TOKEN_INDEXER_POLL_MS`).

```
Soroban RPC ──getEvents──► filter(mint|burn) ──► parse XDR ──► INSERT token_trades
                                                                        │
                                                              Redis cursor (last ledger)
```

**Ledger cursor** — the last processed ledger sequence is stored in Redis under
`token_indexer:last_ledger`. On restart the worker resumes from that point,
avoiding full re-indexing.

### Event Parsing

Each Mint/Burn event carries:

```
topics: [Symbol("mint"|"burn"), u32(market_id), u32(outcome_index)]
value:  Vec[Address(wallet), i128(amount_xlm_stroops), i128(shares)]
```

Price per token is derived as:

```
price_xlm = amount_xlm / shares
```

### Token ID

`token_id = "<market_id>-<outcome_index>"` — e.g. `"42-0"` for outcome 0 of
market 42. This is the primary key used in the API and the DB index.

### Database

Migration `002_create_token_trades.sql` adds:

```sql
token_trades (
  token_id, market_id, outcome_index, event_type,
  price_xlm, volume, wallet_address, ledger, tx_hash, created_at
)
```

Indexed on `(token_id, created_at DESC)` for fast 24-hour window queries.

---

## VWAP Calculation

```
VWAP = Σ(price_i × volume_i) / Σ(volume_i)
```

Implemented in `backend/src/utils/vwap.js`. Trades with zero/negative/NaN
volume or price are silently skipped. Result is rounded to 7 decimal places
(1 stroop precision).

---

## API

```
GET /api/tokens/:token_id/price
```

**Response**

```json
{
  "token_id": "42-0",
  "current_value": "0.8500000 XLM",
  "trade_count": 17,
  "window_hours": 24
}
```

Returns `0.0000000 XLM` when no trades exist in the 24-hour window.

---

## Running the Indexer

```bash
node backend/src/workers/token-price-indexer.js
```

Or add it to your process manager alongside `worker.js`.

---

## Tests

```bash
cd backend && npx jest src/tests/vwap.test.js --coverage --coverageReporters=text
```

VWAP utility achieves ≥ 95 % line/branch coverage.
