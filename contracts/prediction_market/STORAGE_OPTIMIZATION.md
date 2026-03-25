# Optimized Ledger Footprint — Storage Migration

## What Changed

| Data | Before | After | Reason |
|------|--------|-------|--------|
| `TotalPool` (now `TotalShares`) | Persistent | **Instance** | Read/written on every `place_bet` — hot path |
| `IsPaused` (new) | — | **Instance** | Checked on every `place_bet` — hot path |
| `Bets` (now `UserPosition`) | Persistent | **Persistent** | Per-user, infrequently accessed — cold data |
| `Market` metadata | Persistent | **Persistent** | Rarely mutated — cold data |

## Why It Matters

On Soroban, every ledger entry read/write costs XLM fees:

- **Instance storage** entries are loaded as a single bundle when the contract is invoked — no extra per-key fee.
- **Persistent storage** entries each incur an individual read/write fee.

By moving `total_shares` and `is_paused` to Instance storage, `place_bet` saves **2 Persistent reads + 1 Persistent write** per call, replacing them with 0 extra fees (they're already loaded with the instance).

## XLM Savings Estimate

Run before/after cost comparison with:

```bash
# Before (on old contract)
soroban contract invoke \
  --id <CONTRACT_ID_OLD> \
  --source <ACCOUNT> \
  --network testnet \
  --cost \
  -- place_bet \
  --market_id 1 --option_index 0 --bettor <ADDRESS> --amount 100

# After (on new contract)
soroban contract invoke \
  --id <CONTRACT_ID_NEW> \
  --source <ACCOUNT> \
  --network testnet \
  --cost \
  -- place_bet \
  --market_id 1 --option_index 0 --bettor <ADDRESS> --amount 100
```

Expected reduction in the `--cost` output:

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Read ledger entries | 4 | 2 | −2 |
| Write ledger entries | 3 | 1 | −2 |
| Approx. fee (stroops) | ~1200 | ~400 | ~67% |

> Note: Exact numbers depend on network fee schedule. Capture terminal output of `--cost` flag and attach as screenshot in the PR.

## Storage Tier Reference

```
Instance  → loaded once per contract invocation, shared across all calls in a tx
Persistent → individual ledger entry, survives archival, billed per read/write
Temporary  → cheapest, wiped after TTL (not used here)
```
