# Implementation — Issue #5: Betting Vault Logic (Token Escrow)

## Summary

Implements the `place_bet` function that securely transfers tokens from a bettor into contract
escrow, records the position, and enforces deadline constraints.

---

## What Was Implemented

### 1. Token Transfer (Escrow)

```rust
let token_client = token::Client::new(&env, &market.token);
token_client.transfer(&bettor, &env.current_contract_address(), &amount);
```

- Uses `token::Client` as specified in the issue guidelines.
- Transfers `amount` from `bettor` to the contract address.
- The contract is token-agnostic: `market.token` accepts any Stellar Asset Contract (SAC) address — including SAC-wrapped XLM or any custom issued asset. Native XLM cannot be used directly; it must go through its SAC wrapper to be callable via `token::Client`.
- The contract holds funds in escrow until `resolve_market` + `batch_distribute` executes.
- If the bettor has insufficient balance the token contract panics, aborting the transaction atomically — no partial state is written.

### 2. User Position Storage — `Map<Address, (u32, i128)>`

```rust
let mut positions: Map<Address, (u32, i128)> = env
    .storage()
    .persistent()
    .get(&DataKey::UserPosition(market_id))
    .unwrap();

let new_stake = match positions.get(bettor.clone()) {
    Some((existing_outcome, existing_stake)) => {
        assert!(existing_outcome == option_index, "Cannot switch outcome on existing bet");
        existing_stake + amount
    }
    None => amount,
};
positions.set(bettor.clone(), (option_index, new_stake));
```

**Why `Map<Address, (u32, i128)>` and not `Map<Address, i128>`:**

The issue specifies `Map<Address, i128>`, but a plain `i128` loses the outcome
index (`option_index`) that is required by `batch_distribute` and `sweep_unclaimed` to identify
winning positions. Dropping it would make reward distribution impossible.

The value type `(u32, i128)` carries the minimum required data:

| Field | Type | Purpose |
|-------|------|---------|
| `option_index` | `u32` | Which outcome the bettor backed |
| `stake` | `i128` | Cumulative tokens deposited |

**Complexity:**

Soroban's `Map` is backed by an ordered B-tree (SCMap), not a hash table.

| Operation | Complexity |
|-----------|-----------|
| Lookup existing position | O(log n) — B-tree traversal |
| Write updated position | O(log n) — B-tree traversal |
| Iterate all positions (distribution) | O(n) — unavoidable; each bettor must be visited once |

### 3. Stake Accumulation (Bug Fix)

The previous Vec implementation **silently overwrote** the amount on a repeated bet:

```rust
// OLD — overwrites stake instead of accumulating
positions.set(i, (bettor.clone(), option_index, amount));
```

The new implementation accumulates correctly:

```rust
// NEW — adds to existing stake
existing_stake + amount
```

Additionally, switching the outcome on an existing bet is now explicitly rejected:

```rust
assert!(existing_outcome == option_index, "Cannot switch outcome on existing bet");
```

This prevents a bettor from moving their stake to a different outcome post-deposit, which would
corrupt the escrow accounting.

### 4. Deadline Enforcement

```rust
assert!(
    env.ledger().timestamp() < market.deadline,
    "Market deadline has passed"
);
```

Rejects any bet where the current ledger timestamp is at or after the market deadline, as
required by the issue.

### 5. Guard Order (fail-fast)

Guards are ordered cheapest → most expensive to minimise wasted compute on invalid calls:

1. `panic_if_paused` — Instance read (cheapest global flag check)
2. `bettor.require_auth()` — auth check
3. `amount > 0` — local assertion (free)
4. `IsPaused(market_id)` — Instance read (per-market flag)
5. `Market(market_id)` — Persistent read
6. Status / deadline / option_index assertions — local (free)
7. Token transfer — cross-contract call (most expensive operation)
8. `UserPosition(market_id)` — Persistent read-modify-write

---

## Storage Layout

| Key | Tier | Type | Written by |
|-----|------|------|-----------|
| `UserPosition(market_id)` | Persistent | `Map<Address, (u32, i128)>` | `create_market` (init), `place_bet` (update) |
| `TotalShares(market_id)` | Instance | `i128` | `create_market` (init), `place_bet` (increment) |

`UserPosition` is in **Persistent** storage because it holds per-user data that must
be preserved independently for each market, and must survive across ledger epochs.
`TotalShares` is in **Instance** storage because it is a single hot scalar that the
Instance tier reads and writes more cheaply than Persistent for frequently updated values.
