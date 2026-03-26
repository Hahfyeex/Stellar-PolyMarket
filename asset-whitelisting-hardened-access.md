# Implementation Details - Vault: Collateral Asset Whitelisting #16

## Objective
Restrict betting transactions to only use authorized collateral assets (e.g., XLM, USDC). This prevents market volume manipulation using worthless "spam" tokens.

## Implementation Steps

### 1. Architectural Integrity
The `prediction_market` contract now consistently uses **Role-Based Access Control (RBAC)** via the `access` module for administrative operations.

### 2. Storage Keys (`DataKey`)
Added `WhitelistedToken(Address)` to the `DataKey` enum for instance storage.
```rust
pub enum DataKey {
    ...
    /// Hot: whitelisted token status — Instance storage.
    WhitelistedToken(Address),
}
```

### 3. Role-Based Admin Operations
Implemented administrative functions using `check_role(&env, Role::Admin)` (from the `access` module) to ensure secure and consistent platform management.

```rust
/// Update the whitelist status of a collateral token (admin only).
pub fn set_token_whitelist(env: Env, token: Address, whitelisted: bool) {
    // Production-grade RBAC enforcement
    check_role(&env, Role::Admin);
    env.storage()
        .instance()
        .set(&DataKey::WhitelistedToken(token), &whitelisted);
}

/// Check if a token is whitelisted for collateral.
pub fn is_token_whitelisted(env: Env, token: Address) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::WhitelistedToken(token))
        .unwrap_or(false)
}
```

### 4. Enforcement in Betting Logic
Integrated a mandatory whitelist check in `place_bet` to reject transactions using unauthorized tokens.

```rust
pub fn place_bet(env: Env, market_id: u64, ...) {
    ...
    // Restriction: check if token is whitelisted to prevent spam tokens
    let whitelisted: bool = env
        .storage()
        .instance()
        .get(&DataKey::WhitelistedToken(market.token.clone()))
        .unwrap_or(false);
    assert!(whitelisted, "TokenNotWhitelisted");
    ...
}
```

## Testing and Verification

### 100% Stability Across Test Suite
- **Updated Helpers**: `setup()` and `setup_market_with_winners()` now whitelist assets by default.
- **Manual Test Hardening**: All independent test cases calling `place_bet` (e.g., `test_total_shares_consistent_after_multiple_bets`) have been updated to whitelist their tokens.
- **Negative Validation**: Added `test_bet_with_unwhitelisted_token_panics` to ensure rejection logic works as intended.

## Complexity Analysis
- **Time Complexity**: 
  - `set_token_whitelist`: O(1) - Persistent read (RBAC) + Instance write.
  - `place_bet`: O(1) - Instance lookup (O(1)).
- **Space Complexity**:
  - O(W) where W is the number of whitelisted tokens (stored as unique keys in instance storage).

## Visual Validation (Test Log)
Expected terminal output for invalid tokens:
```text
test tests::test_bet_with_unwhitelisted_token_panics - should panic ... ok
...
panic: 'TokenNotWhitelisted'
...
```
