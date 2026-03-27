# Ledger Event Scraper

Go service that scrapes Stellar Horizon ledger operations and persists matching contract invocation events to PostgreSQL.

## Features

- Scrapes Stellar ledger operations via the Horizon REST API
- Filters for Soroban `invoke_host_function` operations matching a contract address
- Concurrent processing with a configurable goroutine worker pool
- Catch-up mode: start from any historical ledger with `--start-ledger`
- Resume mode: automatically continues from the last processed ledger stored in the database
- Stores events as structured JSONB for flexible querying

## Prerequisites

- Go 1.22+
- PostgreSQL 14+

## Configuration

| Environment Variable | Description | Default |
|---|---|---|
| `HORIZON_URL` | Stellar Horizon API endpoint | `https://horizon-testnet.stellar.org` |
| `DATABASE_URL` | PostgreSQL connection string | *required* |
| `CONTRACT_ADDRESS` | Soroban contract address to filter | (none — scrape all invocations) |
| `WORKER_COUNT` | Number of concurrent ledger workers | `10` |
| `POLL_INTERVAL_SEC` | Seconds between polls when caught up | `5` |

## Usage

```bash
# Build
cd scraper
go build -o scraper .

# Run (resume from last checkpoint)
DATABASE_URL="postgres://user:pass@localhost:5432/polymarket?sslmode=disable" \
CONTRACT_ADDRESS="CABC123..." \
  ./scraper

# Catch-up from a specific ledger
./scraper --start-ledger 1000000

# Override contract address via flag
./scraper --contract-address CXYZ789...
```

## Database Schema

The scraper automatically creates two tables on startup:

### `ledger_events`

| Column | Type | Description |
|---|---|---|
| `id` | `BIGSERIAL` | Primary key |
| `ledger_seq` | `BIGINT` | Ledger sequence number |
| `tx_hash` | `TEXT` | Transaction hash |
| `event_type` | `TEXT` | Function name or `contract_invoke` |
| `data` | `JSONB` | Full operation details |
| `timestamp` | `TIMESTAMPTZ` | Operation timestamp from Horizon |
| `created_at` | `TIMESTAMPTZ` | Row insertion time |

### `scraper_state`

Single-row table tracking the last fully processed ledger.

## Querying Events

```sql
-- Recent events for a contract
SELECT event_type, tx_hash, data, timestamp
FROM ledger_events
WHERE ledger_seq > 1000000
ORDER BY ledger_seq DESC
LIMIT 50;

-- Count events by type
SELECT event_type, COUNT(*)
FROM ledger_events
GROUP BY event_type
ORDER BY count DESC;

-- Find events by function parameters
SELECT *
FROM ledger_events
WHERE data->>'function' = 'place_bet'
  AND timestamp > NOW() - INTERVAL '24 hours';
```

## Testing

```bash
go test -v ./...
```

## Architecture

```
main.go          CLI entrypoint, signal handling, dependency wiring
config/          Environment-based configuration loading
scraper/         Core scraping loop, Horizon API client, event filtering
store/           PostgreSQL persistence (events + scraper state)
```

The scraper runs a main loop that:

1. Fetches the latest ledger sequence from Horizon
2. Distributes a batch of ledger sequences to a goroutine worker pool
3. Each worker fetches operations for its ledger and filters for contract invocations
4. Results are collected and saved in sequential order
5. The last-processed ledger marker is updated after each successful save
6. When caught up, the scraper polls at the configured interval
