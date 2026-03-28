# Graceful Shutdown — Admin Tool

## What It Does

`set_global_status(active: false)` puts the platform into **graceful shutdown** mode:

| Function | Shutdown behaviour |
|----------|--------------------|
| `create_market` | ❌ Reverts with `"Platform is shut down"` |
| `place_bet` | ✅ Works — existing markets stay open |
| `resolve_market` | ✅ Works — oracle can still settle |
| `batch_distribute` | ✅ Works — winners can still claim |
| `set_global_status(true)` | ✅ Re-activates the platform at any time |

A single `GlobalStatus` boolean lives in **Instance storage** — one cheap read on
`create_market`, zero overhead on every other function.

---

## Why This Is Better Than a Hard Pause

A **hard pause** (circuit breaker) freezes everything:

```
Hard Pause:  create_market ❌  place_bet ❌  resolve ❌  claim ❌
```

This creates two serious problems:

1. **Funds get locked.** Users who already staked cannot claim winnings until the
   admin manually re-opens the contract — a trust and legal liability issue.
2. **Markets can't settle.** Oracles may have already confirmed results; blocking
   `resolve_market` means the on-chain state diverges from reality.

**Graceful shutdown** is a one-way valve on *new activity* only:

```
Graceful Shutdown:  create_market ❌  place_bet ✅  resolve ✅  claim ✅
```

- Users keep full access to their funds.
- All in-flight markets reach a natural conclusion.
- The platform drains cleanly — no emergency intervention needed.
- Re-activation (`set_global_status(true)`) is instant if the shutdown was precautionary.

---

## Usage

```bash
# Initiate graceful shutdown
soroban contract invoke --id $CONTRACT --source $ADMIN --network testnet \
  -- set_global_status --active false

# Verify
soroban contract invoke --id $CONTRACT --network testnet \
  -- get_global_status
# → false

# Attempt to create a market (should revert)
soroban contract invoke --id $CONTRACT --source $ADMIN --network testnet \
  -- create_market --id 99 --question "Test" --options '["Yes","No"]' \
     --deadline 9999999999 --token $TOKEN
# → error: "Platform is shut down"

# Claim still works for existing markets
soroban contract invoke --id $CONTRACT --source $WINNER --network testnet \
  -- batch_distribute --market_id 1 --batch_size 10
# → succeeds

# Re-activate if needed
soroban contract invoke --id $CONTRACT --source $ADMIN --network testnet \
  -- set_global_status --active true
```

---

## Storage

| Key | Tier | Default |
|-----|------|---------|
| `GlobalStatus` | Instance | `true` (active) |

Set on `initialize`. One Instance read per `create_market` call — negligible cost.
