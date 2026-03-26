# Position Tokens — Mini README

## What are Position Tokens?

When a user places a bet via `place_bet`, the contract mints a **position token** — a non-transferable receipt that records the user's stake in a specific market outcome.

```
place_bet(market_id=42, outcome=0, bettor=Alice, amount=100)
  → mints 100 position tokens for Alice on (market_id=42, outcome=0)
  → emits event: ("position_token", "mint", (42, 0, Alice, 100))
```

Token identity is `(market_id, outcome_index)` — e.g. outcome `0` on market `42` represents the "YES" position.

---

## How Position Tokens Interact with the Vault

The main contract acts as the **Vault**: it holds all staked XLM/tokens in its own account.  
Position tokens are *receipts* against that Vault.

```
User stakes 100 XLM
  ↓
Vault receives 100 XLM  (token::transfer bettor → contract)
Position token minted   (balance stored in Persistent storage)

Market resolves → batch_distribute called
  ↓
Position token burned   (receipt destroyed)
Vault releases payout   (token::transfer contract → bettor)
```

The burn happens **atomically inside the same `batch_distribute` call** as the payout transfer, so a token can never be burned without a corresponding payout, and a payout can never be issued twice (the token is gone after the first burn).

---

## Non-Transferability

Position tokens are stored as a `Map<Address, i128>` in Soroban Persistent storage.  
There is **no `transfer` entry-point** — the only way to move value is through the Vault's `batch_distribute` function.  
This keeps positions inside the Stella ecosystem until a secondary-market module is explicitly added.

---

## Storage Layout

| Key | Storage tier | Description |
|-----|-------------|-------------|
| `TokenKey::Balances(market_id, outcome_index)` | Persistent | `Map<Address, i128>` of balances per outcome |

---

## Events

| Topic tuple | Data tuple | Emitted by |
|-------------|-----------|------------|
| `("position_token", "mint")` | `(market_id, outcome_index, owner, amount)` | `place_bet` |
| `("position_token", "burn")` | `(market_id, outcome_index, owner, amount)` | `batch_distribute` |

---

## Test Coverage

The mint/burn cycle is covered by 7 dedicated tests in `lib.rs`:

| Test | What it verifies |
|------|-----------------|
| `test_place_bet_mints_position_tokens` | Mint amount equals stake |
| `test_two_bets_accumulate_position_tokens` | Repeated bets accumulate |
| `test_position_tokens_are_per_outcome` | Tokens are outcome-scoped |
| `test_position_token_balance_zero_for_non_bettor` | Zero balance for non-bettors |
| `test_batch_distribute_burns_position_tokens` | Full burn on settlement |
| `test_loser_position_tokens_not_burned_by_distribute` | Losers' tokens untouched |
| `test_partial_batch_burns_only_settled_winners` | Partial batch burns only settled slice |
