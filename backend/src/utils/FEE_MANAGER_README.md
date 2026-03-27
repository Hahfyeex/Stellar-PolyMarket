# Dynamic Oracle Fee Manager

## What it does

`fee-manager.js` monitors the Stellar network's `fee_stats` endpoint (via Horizon) and dynamically selects the appropriate `base_fee` for every Oracle transaction submitted by the relayer.

When the network is congested, Oracle proposals would otherwise sit unconfirmed in the queue. This service ensures "Truth" transactions are always prioritised.

## How it works

1. Before building each transaction, call `getOracleFee()`.
2. It fetches `fee_stats` from Horizon and reads the **90th-percentile fee** (`fee_charged.p90`).
3. If `p90 > CONGESTION_THRESHOLD` → **High Congestion** path:
   - Fee is set to `p90`, capped at `MAX_FEE_CAP`.
   - An `[INFO]` log is emitted: `High Congestion detected. Adjusting fee to <N> stroops.`
4. Otherwise → **Normal** path: fee stays at `BASE_FEE`.

## Max Fee Cap

The `MAX_FEE_CAP` is a hard ceiling (default **10 000 stroops ≈ 0.001 XLM**) that prevents the relayer from accidentally overspending during extreme fee spikes (e.g. network spam attacks).

Without this cap, a single transaction during a spike could cost hundreds of times the normal fee, draining the relayer wallet silently.

**Override via environment variable:**

```
MAX_FEE_CAP=5000   # stroops — set lower for tighter cost control
```

## Environment Variables

| Variable               | Default | Description                                              |
|------------------------|---------|----------------------------------------------------------|
| `ORACLE_BASE_FEE`      | `100`   | Fee (stroops) used during normal network conditions      |
| `MAX_FEE_CAP`          | `10000` | Hard ceiling on any Oracle transaction fee               |
| `CONGESTION_THRESHOLD` | `200`   | p90 value above which the network is considered congested|
| `STELLAR_NETWORK`      | testnet | Set to `mainnet` to point at Horizon mainnet             |

## Fee Adjustment Audit Log

Every fee decision is logged as a structured event with `event: "FeeAdjustment"`:

```json
{
  "level": "INFO",
  "event": "FeeAdjustment",
  "p90": 500,
  "adjusted_fee": 500,
  "max_fee_cap": 10000,
  "congestion_threshold": 200,
  "msg": "[INFO] High Congestion detected. Adjusting fee to 500 stroops."
}
```

These logs can be queried in any structured log aggregator (Datadog, CloudWatch, etc.) by filtering on `event = "FeeAdjustment"`.
