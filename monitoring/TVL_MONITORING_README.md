# TVL Monitoring — Prometheus & Grafana

Real-time Total Value Locked monitoring for Stella Polymarket.

## Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /metrics` | None | Prometheus scrape endpoint |
| `GET /api/tvl` | App Check | Current TVL JSON for the frontend dashboard |

## Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `tvl_total_xlm` | Gauge | Sum of all active market pool balances (XLM) |
| `tvl_per_market{market_id}` | Gauge | Pool balance for a single active market |

Default Node.js process metrics (memory, CPU, event loop lag) are also exposed.

## Poller

The background poller queries the DB every **30 seconds** and updates both gauges.
Interval is configurable via `TVL_SCRAPE_INTERVAL_MS` env var (useful for tests).

## Alert Thresholds

Defined in `monitoring/alerts.yml`:

| Alert | Condition | Severity |
|-------|-----------|----------|
| `TVLDropOver20Percent` | `tvl_total_xlm < 0.80 * tvl_total_xlm offset 5m` | critical |
| `MarketPoolDrained` | `tvl_per_market == 0` for 1m | warning |

To change the 20% threshold, edit the `0.80` multiplier in `alerts.yml` — no code change needed.

## Connecting Grafana

1. Add a Prometheus data source pointing to `http://localhost:9090`
2. Import `monitoring/grafana-dashboard.json` via **Dashboards → Import**
3. The dashboard includes:
   - TVL over time (time series)
   - Per-market pool balances (time series)
   - 5-minute TVL change % (stat panel with red/yellow/green threshold)

## Prometheus Config (minimal)

```yaml
# prometheus.yml
scrape_configs:
  - job_name: stella-polymarket
    static_configs:
      - targets: ["localhost:4000"]
    metrics_path: /metrics

rule_files:
  - monitoring/alerts.yml
```

## Running Tests

```bash
cd backend
npx jest src/tests/tvlService.test.js --coverage
```
