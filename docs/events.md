# Contract Event Schema

All prediction market contract events are emitted via `env.events().publish()` at the end of every state-changing function. Events are versioned so downstream parsers can handle schema evolution without breaking.

## Conventions

- **Topic layout**: `(SYMBOL, market_id?)` — the first element is always a short symbol identifying the event type.
- **Data payload**: a typed struct serialised as XDR. The first field is always `version: u32`.
- **Amounts**: all monetary values are `i128` in **stroops** (7-decimal fixed-point, 1 XLM = 10,000,000 stroops). No floats.
- **Current schema version**: `1`

---

## Events

### `Init` — Contract Initialized

Emitted once by `initialize`.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version (currently `1`) |
| `admin` | `Address` | Admin address set at initialization |
| `ledger_timestamp` | `u64` | Ledger timestamp (Unix seconds) |

**Topic**: `("Init",)`

---

### `MktCreate` — Market Created

Emitted by `create_market` after all storage writes succeed.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Unique market identifier |
| `creator` | `Address` | Address that created the market |
| `question` | `String` | Market question text |
| `options_count` | `u32` | Number of outcome options (2–8) |
| `deadline` | `u64` | Betting deadline (Unix seconds) |
| `token` | `Address` | Token contract used for bets |
| `lmsr_b` | `i128` | LMSR liquidity parameter (stroops) |
| `creation_fee` | `i128` | Fee charged at creation (0 = free) |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("MktCreate", market_id)`

---

### `BetPlace` — Bet Placed

Emitted by `place_bet` and `place_bet_with_sig`.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Market identifier |
| `bettor` | `Address` | Bettor's address |
| `option_index` | `u32` | Outcome index chosen (0-based) |
| `cost` | `i128` | LMSR cost delta charged (stroops) |
| `shares` | `i128` | Number of shares purchased |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("BetPlace", market_id)`

> Note: `cost` is the LMSR cost delta (what the bettor actually pays), not the raw share count.

---

### `MktResolv` — Market Resolved

Emitted by `resolve_market` on successful final resolution.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Market identifier |
| `winning_outcome` | `u32` | Index of the winning outcome |
| `total_pool` | `i128` | Total pool at resolution (stroops) |
| `fee_bps` | `u32` | Dynamic fee applied in basis points |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("MktResolv", market_id)`

---

### `MktVoid` — Market Voided

Emitted by `resolve_market` when a conditional market's condition is not met.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Market identifier |
| `condition_market_id` | `u64` | Referenced condition market |
| `condition_outcome_actual` | `u32` | Actual outcome of the condition market |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("MktVoid", market_id)`

---

### `MktPause` — Market Paused / Unpaused

Emitted by `set_paused`.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Market identifier |
| `paused` | `bool` | `true` = paused, `false` = unpaused |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("MktPause", market_id)`

---

### `Payout` — Payout Batch Processed

Emitted by `batch_distribute` and `batch_payout` after each batch completes.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Market identifier |
| `recipients_paid` | `u32` | Winners paid in this batch |
| `total_distributed` | `i128` | Total stroops distributed in this batch |
| `cursor` | `u32` | Settlement cursor after this batch (`0` for `batch_payout`) |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("Payout", market_id)`

---

### `LpSeed` — Liquidity Provided

Emitted by `provide_liquidity`.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Market identifier |
| `provider` | `Address` | LP address |
| `amount` | `i128` | Amount deposited (stroops) |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("LpSeed", market_id)`

---

### `LpClaim` — LP Reward Claimed

Emitted by `claim_lp_reward`.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Market identifier |
| `lp` | `Address` | LP address claiming the reward |
| `reward` | `i128` | Reward amount transferred (stroops) |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("LpClaim", market_id)`

---

### `Dispute` — Dispute Raised

Emitted by `dispute` when a disputer posts a bond.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Market identifier |
| `disputer` | `Address` | Address raising the dispute |
| `bond_amount` | `i128` | Bond escrowed (stroops) |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("Dispute", market_id)`

---

### `FeeColl` — Creation Fee Collected

Emitted by `create_market` when a non-zero creation fee is charged.

| Field | Type | Description |
|---|---|---|
| `version` | `u32` | Schema version |
| `market_id` | `u64` | Market identifier |
| `payer` | `Address` | Address that paid the fee (creator) |
| `fee_destination` | `Address` | Address that received the fee |
| `amount` | `i128` | Fee amount (stroops) |
| `ledger_timestamp` | `u64` | Ledger timestamp |

**Topic**: `("FeeColl", market_id)`

---

## Versioning Policy

When a payload field is added, removed, or renamed:

1. Increment `EVENT_VERSION` in `contracts/prediction_market/src/events.rs`.
2. Add a new struct variant (e.g. `EventMarketCreatedV2`) and update the emit helper.
3. Update this document and bump the version table below.
4. Update the Node.js parser in `backend/src/indexer/mercury.js` to handle both versions.

| Version | Date | Changes |
|---|---|---|
| 1 | 2026-03-26 | Initial versioned schema |

---

## Mercury / Scraper Integration

The Node.js backend parses these events in `backend/src/indexer/mercury.js`.
Each topic symbol maps to a handler function:

| Topic | Handler |
|---|---|
| `MktCreate` | `handleMarketCreated` |
| `BetPlace` | `handleBetPlaced` |
| `MktResolv` | `handleMarketResolved` |
| `MktVoid` | `handleMarketVoided` |
| `MktPause` | `handleMarketPaused` |
| `Payout` | `handlePayoutClaimed` |
| `LpSeed` | `handleLiquidityProvided` |
| `LpClaim` | `handleLpRewardClaimed` |
| `Dispute` | `handleDisputeRaised` |
| `FeeColl` | `handleFeeCollected` |
