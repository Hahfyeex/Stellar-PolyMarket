# Binary Market Engine

Soroban smart contract implementing a binary (2–5 outcome) prediction market with token locking and proportional payout distribution.

## Deployment

```bash
# Build
soroban contract build --manifest-path contracts/binary_market/Cargo.toml

# Deploy to testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/binary_market.wasm \
  --source <ADMIN_SECRET_KEY> \
  --network testnet

# Initialize
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_SECRET_KEY> \
  --network testnet \
  -- initialize --admin <ADMIN_ADDRESS>
```

## Function Signatures

| Function | Auth | Description |
|---|---|---|
| `initialize(admin)` | admin | One-time setup |
| `create_market(id, question, outcomes, end_date, token)` | admin | Create a new market |
| `place_bet(market_id, outcome_index, bettor, amount)` | bettor | Lock funds and record bet |
| `resolve_market(market_id, winning_outcome)` | admin | Set winning outcome |
| `distribute_rewards(market_id)` | none | Pay winners proportionally |
| `get_market(market_id)` | none | Read market state |
| `get_total_pool(market_id)` | none | Read total locked funds |

## Storage Keys

| Key | Type | Storage | Description |
|---|---|---|---|
| `DataKey::Admin` | `Address` | Instance | Contract admin |
| `DataKey::Market(id)` | `Market` | Persistent | Market metadata |
| `DataKey::Bets(id)` | `Vec<(Address, u32, i128)>` | Persistent | All bets for a market |
| `DataKey::TotalPool(id)` | `i128` | Persistent | Sum of all bets |

## Payout Formula

```
payout = (bet_amount × total_pool × 97/100) / winning_stake
```

3% of the pool is retained as a platform fee.

## Validations

- `end_date` must be in the future
- `outcomes` must have 2–5 entries
- `outcome_index` must be valid
- `amount` must be positive
- Market must not be resolved before `resolve_market`
- Bets rejected after `end_date` or after resolution
