# Mercury Indexer

Indexes all Soroban prediction market contract events into PostgreSQL and exposes a GraphQL API for fast queries.

## Architecture

```
Stellar Network
    ↓ events
Mercury Indexer → POST /api/indexer/webhook
    ↓
PostgreSQL (events, markets, bets, users)
    ↓
GraphQL /graphql
```

## Setup

```bash
# Environment variables
MERCURY_URL=https://api.mercurydata.app
MERCURY_API_KEY=your_key
MERCURY_WEBHOOK_SECRET=your_secret
CONTRACT_ADDRESS=CXXX...
DATABASE_URL=postgres://...
```

On startup the server automatically subscribes `CONTRACT_ADDRESS` to Mercury.
Mercury will POST events to `POST /api/indexer/webhook`.

## Schema

### `events` — raw contract event log
| Column | Type | Description |
|---|---|---|
| `contract_id` | TEXT | Soroban contract address |
| `topic` | TEXT | Event name (Bet, MarketCreated, MarketResolved) |
| `payload` | JSONB | Full event data |
| `ledger_seq` | BIGINT | Ledger sequence number |
| `ledger_time` | TIMESTAMPTZ | Ledger close time |
| `tx_hash` | TEXT | Transaction hash (unique with event_index) |

### `markets` — prediction market metadata
Extends the existing markets table with `category` column.

### `bets` — individual bet records
Indexed on `market_id`, `wallet_address`, `created_at`.

### `users` — per-wallet aggregate stats
| Column | Description |
|---|---|
| `total_staked` | Sum of all bet amounts |
| `total_won` | Sum of winning payouts |
| `bet_count` | Total bets placed |
| `win_count` | Total winning bets |

## GraphQL Endpoint

`GET/POST /graphql` — GraphQL Yoga playground available in development.

## Example Queries

**1. Bet history for a wallet (user portfolio)**
```graphql
query {
  betsByWallet(wallet_address: "GABC...", limit: 20) {
    id amount outcome_index created_at
    market { question status }
  }
}
```

**2. Market stats**
```graphql
query {
  marketStats(market_id: 1) {
    total_pool bet_count unique_bettors
    outcome_stakes { outcome_index total_stake bet_count }
  }
}
```

**3. All open crypto markets**
```graphql
query {
  markets(status: "ACTIVE", category: "crypto") {
    id question total_pool end_date bet_count
  }
}
```

**4. User profile**
```graphql
query {
  user(wallet_address: "GABC...") {
    total_staked total_won bet_count win_count
    bets { amount outcome_index created_at }
  }
}
```

**5. Raw event log for a contract**
```graphql
query {
  events(topic: "Bet", limit: 50) {
    tx_hash ledger_time payload
  }
}
```

## Adding a New Event Type

1. Add a handler in `src/indexer/mercury.js`
2. Add a `case` in the `processEvent` switch
3. Add the corresponding GraphQL type/resolver if needed
