# Bug Fixes Summary

This document summarizes the implementation of four critical bug fixes for the Stellar PolyMarket prediction market platform.

## Branch
`fix/325-326-327-368-auth-ttl-payout-deadline`

## Fixes Implemented

### #325: Add Auth Guard to distribute_rewards [HIGH SEVERITY]

**File**: `contracts/prediction_market/src/lib.rs`

**Problem**: The `distribute_rewards` function had no authorization check, allowing any external address to trigger payout distribution.

**Solution**:
- Added `resolver: Address` parameter to `distribute_rewards`
- Added `require_role(&env, &resolver, Role::Resolver)` check
- Only Resolver role can now trigger payouts
- Added unit test `test_distribute_rewards_unauthorized_panics` to verify unauthorized calls panic

**Impact**: Prevents malicious actors from front-running or manipulating payout distribution.

---

### #326: Add extend_ttl to All Persistent Storage Writes [HIGH SEVERITY]

**File**: `contracts/prediction_market/src/lib.rs`

**Problem**: Persistent storage writes lacked `extend_ttl` calls, causing data to expire and become inaccessible on Stellar mainnet.

**Solution**:
- Added `extend_ttl` after `SettlementFeePaid` flag writes (line 1631, 1883)
- Added `extend_ttl` after `RefundClaimed` flag writes (line 2008)
- Added `extend_ttl` after Market creation (line 384)
- Added unit tests:
  - `test_ttl_extended_on_market_creation`: Verifies TTL extension on market creation
  - `test_ttl_extended_on_bet_placement`: Verifies TTL extension on bet placement

**Impact**: Prevents permanent data loss and ensures market data remains accessible for 30+ days.

---

### #327: Fix Payout Calculation Using BigInt [MEDIUM SEVERITY]

**File**: `backend/src/routes/bets.js`

**Problem**: Payout calculations used JavaScript floating point, causing 1-2 stroop precision errors per winner.

**Solution**:
- Replaced all `parseFloat` with BigInt arithmetic
- Convert amounts to stroops (multiply by 10^7) before calculations
- Fee calculation: `payoutPool = (totalPool * 97n) / 100n`
- Per-winner payout: `(betAmount * payoutPool) / winningStake`
- Added comprehensive unit tests in `backend/src/tests/payout-calculation.test.js`:
  - Single winner scenario
  - 10 equal-stake winners
  - 100 unequal-stake winners
  - Stroop precision validation
  - Pool distribution verification

**Impact**: Ensures exact stroop-level accuracy, preventing payout discrepancies across all market sizes.

---

### #368: Add Deadline Check to resolve_market [HIGH SEVERITY]

**File**: `contracts/prediction_market/src/lib.rs`

**Problem**: `resolve_market` could be called before the market deadline, allowing early resolution before users could place bets.

**Solution**:
- Added assertion: `assert!(env.ledger().timestamp() >= market.deadline, "Market deadline not reached")`
- Check placed before liveness window check
- Added unit tests:
  - `test_resolve_market_before_deadline_panics`: Verifies resolution before deadline fails
  - `test_resolve_market_after_deadline_succeeds`: Verifies resolution after deadline succeeds

**Impact**: Enforces fairness by preventing premature market resolution.

---

## Testing

All fixes include comprehensive unit tests:

### Smart Contract Tests (Rust)
- Authorization tests for `distribute_rewards`
- TTL extension verification tests
- Deadline enforcement tests

### Backend Tests (JavaScript)
- Payout calculation precision tests with 1, 10, and 100 winners
- Stroop-level accuracy validation
- Pool distribution verification

## Verification

Run tests with:

```bash
# Smart contract tests
cd contracts/prediction_market
cargo test

# Backend tests
cd backend
npm test -- src/tests/payout-calculation.test.js
```

## Commits

1. `91d212b` - fix(#325): Add auth guard to distribute_rewards function
2. `2392ad0` - fix(#326): Add extend_ttl to all persistent storage writes
3. `9683bb4` - fix(#327): Use BigInt for payout calculations to ensure stroop precision
4. `15eb25f` - fix(#368): Add deadline check to resolve_market function

## Security Considerations

- **#325**: Prevents unauthorized payout manipulation
- **#326**: Prevents permanent data loss on mainnet
- **#327**: Ensures financial accuracy and prevents rounding exploits
- **#368**: Prevents unfair market manipulation through early resolution

All fixes maintain backward compatibility with existing market data and user positions.
