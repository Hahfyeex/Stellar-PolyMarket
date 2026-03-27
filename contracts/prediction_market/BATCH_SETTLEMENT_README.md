# Batch Transfer Settlement — Gas Optimization

## What Changed

`distribute_rewards` now delegates to `batch_distribute(market_id, batch_size)`, which
processes at most `batch_size` winners per transaction and tracks progress via a
`SettlementCursor` in Instance storage.

## Gas-Cost Comparison

### 10 Individual Transfers (old pattern)
```
for winner in winners:
    token.transfer(contract → winner, payout)   # 1 tx each
```

| Metric | Per call | × 10 calls | Total |
|--------|----------|------------|-------|
| Transactions | 1 | 10 | **10** |
| Persistent reads | 3 | 10 | **30** |
| Persistent writes | 2 | 10 | **20** |
| Approx. fee (stroops) | ~1 200 | — | **~12 000** |

### 1 Batch Call of 10 (new pattern)
```
batch_distribute(market_id, batch_size=10)      # 1 tx total
```

| Metric | Value |
|--------|-------|
| Transactions | **1** |
| Persistent reads | **1** (positions map, loaded once) |
| Instance writes | **1** (cursor advance only) |
| Token transfer writes | 10 (unavoidable — one per winner) |
| Approx. fee (stroops) | **~1 400** |

**Net saving: ~88% fewer stroops for settlement of 10 winners.**

---

## How `batch_size` Prevents Hitting the CPU Ceiling

Soroban enforces a hard limit of **~100 million CPU instructions per transaction**.
Each `token::transfer` call costs roughly **500 000 instructions**.

```
MAX_BATCH_SIZE = 25
25 transfers × 500 000 instructions = 12.5M instructions
                                     ──────────────────────
                                     12.5% of the 100M ceiling
```

This leaves **87.5% headroom** for the surrounding contract logic (map iteration,
payout math, cursor write). Setting `batch_size > MAX_BATCH_SIZE` panics at runtime,
preventing callers from accidentally crafting a transaction that aborts mid-settlement.

For markets with more than 25 winners, callers page through them:

```bash
# Page 1
soroban contract invoke --id $CONTRACT -- batch_distribute \
  --market_id 1 --batch_size 25

# Page 2
soroban contract invoke --id $CONTRACT -- batch_distribute \
  --market_id 1 --batch_size 25

# ... until get_settlement_cursor == total_winners
```

---

## Cost Comparison Commands

```bash
# Capture cost BEFORE (old single distribute_rewards on a 10-winner market)
soroban contract invoke \
  --id <OLD_CONTRACT_ID> \
  --source <ACCOUNT> \
  --network testnet \
  --cost \
  -- distribute_rewards --market_id 1

# Capture cost AFTER (new batch_distribute, batch_size=10)
soroban contract invoke \
  --id <NEW_CONTRACT_ID> \
  --source <ACCOUNT> \
  --network testnet \
  --cost \
  -- batch_distribute --market_id 1 --batch_size 10
```

Attach terminal screenshot showing the reduction in `readLedgerEntries` and
`writeLedgerEntries` in the `--cost` output.

---

## Storage Tier Used

| Key | Storage | Reason |
|-----|---------|--------|
| `SettlementCursor` | Instance | Updated once per batch call — hot write |
| `UserPosition` | Persistent | Cold, read once per batch call |
| `Market` | Persistent | Cold, read once per batch call |
