# Market Creation Fee — Configuration & DAO Governance

## Overview

Without a creation fee the platform is vulnerable to spam markets that pollute the
discovery feed and waste oracle resources. The `CreationFee` feature charges a
configurable amount of the market's token from the creator before the market is stored.

---

## Fee Configuration Parameters

| Parameter | Storage Key | Type | Default | Description |
|-----------|-------------|------|---------|-------------|
| `creation_fee` | `DataKey::CreationFee` | `i128` (stroops) | `0` | Fee charged per market creation. `0` = free. |
| `fee_destination` | `DataKey::FeeDestination` | `Address` | unset | Recipient of the fee (burn address or DAO treasury). |
| `fee_mode` | `DataKey::FeeModeConfig` | `FeeMode` | `Treasury` | Routing mode: `Burn` or `Treasury`. |

All three values live in **Instance storage** — they can be updated by the admin at any
time without redeploying the contract.

---

## Fee Routing Modes

### `FeeMode::Burn`
The fee is transferred to a **burn address** — typically the token issuer account with a
locked trustline. On Stellar, sending tokens to the issuer with a locked trustline
effectively removes them from circulation.

```
creator ──[fee]──► issuer (locked trustline) = burned
```

### `FeeMode::Treasury`
The fee is transferred to the **DAO treasury** — a multisig Stellar account address
stored in `DataKey::FeeDestination`. The DAO can then vote on how to spend these funds
(grants, buybacks, liquidity, etc.).

```
creator ──[fee]──► DAO multisig treasury
```

---

## Admin API

### `update_fee(new_fee, new_destination, new_mode)`

Updates all three fee parameters atomically. Requires admin authorization.
Takes effect immediately on the next `create_market` call — no redeployment needed.

```rust
// Set 100 stroops fee, routed to DAO treasury
client.update_fee(100, dao_treasury_address, FeeMode::Treasury);

// Set 50 stroops fee, burned
client.update_fee(50, burn_address, FeeMode::Burn);

// Disable fee entirely
client.update_fee(0, any_address, FeeMode::Treasury);
```

### `get_fee_config() -> (i128, Option<Address>, FeeMode)`

Returns the current fee configuration as a tuple.

```rust
let (fee, destination, mode) = client.get_fee_config();
```

---

## DAO Governance Integration

The fee amount is controlled by DAO governance through the admin key:

1. DAO members vote on a new fee amount via the governance mechanism
2. The winning proposal calls `update_fee` through the admin multisig
3. The new fee takes effect on the next market creation — no downtime

**Recommended governance parameters:**
- Minimum fee: `0` (free, for bootstrapping)
- Maximum fee: `10_000_000` stroops (1 XLM) — prevents abuse while staying accessible
- Default: `1_000_000` stroops (0.1 XLM)

---

## Error Handling

If the creator has insufficient token balance to cover the fee, the transaction aborts
with `"InsufficientFeeBalance"` and **no market is created**. The creator's balance is
unchanged.

---

## Events

A `FeeColl` event is emitted on every successful fee collection:

| Field | Value |
|-------|-------|
| Topic 0 | `"FeeColl"` |
| Topic 1 | `creator` (Address) |
| Data | `(fee_destination, creation_fee, fee_mode)` |

Off-chain indexers can use this event to track fee revenue and routing.
