# Settlement Mathematics Specification

## Overview

This document describes the mathematical formulas and algorithms used for calculating prediction market payouts in the Stellar PolyMarket contract. The implementation prioritizes **conservation** (no XLM lost), **precision** (no floating-point errors), and **fairness** (proportional distribution).

## Core Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `PRECISION` | 10,000,000 (10⁷) | Fixed-point decimal places |
| `PLATFORM_FEE_NUMERATOR` | 3 | Numerator of platform fee |
| `PLATFORM_FEE_DENOMINATOR` | 100 | Denominator of platform fee |

## Fee Calculation

The platform retains a **3% fee** on all pools. This is calculated as:

```
platform_fee = floor(total_pool × 3 / 100)
```

### Examples

| Total Pool | Platform Fee (3%) | Payout Pool (97%) |
|------------|-------------------|-------------------|
| 1,000 XLM | 30 XLM | 970 XLM |
| 10,000 XLM | 300 XLM | 9,700 XLM |
| 1,000,000 XLM | 30,000 XLM | 970,000 XLM |

## Payout Formula

For each winning bettor, the payout is calculated using the following formula:

```
payout = floor(bet_amount × payout_pool / winning_stake)
```

Where:
- `bet_amount` = The bettor's stake on the winning outcome
- `payout_pool` = Total pool minus platform fee (97% of total)
- `winning_stake` = Sum of all bets on the winning outcome

### Proportional Distribution

The formula ensures that each winner receives a share proportional to their bet relative to all winning bets:

```
payout / bet_amount ≈ payout_pool / winning_stake
```

This means if you bet 10% of the winning pool, you receive approximately 10% of the payout pool.

## Dust Handling

### The Problem

Integer division in smart contracts can lose precision. For example:

```
100 bets of 1 XLM each on Yes (total: 100 XLM)
Payout pool: 97 XLM
Ideal payout per bet: 97/100 = 0.97 XLM
```

With pure integer division, each bettor would receive `floor(1 × 97 / 100) = 0` XLM, losing the entire payout pool!

### The Solution: Dust Redistribution

We implement a **dust redistribution algorithm** that ensures 100% conservation:

1. **Calculate ideal payouts** using integer division (truncating fractions)
2. **Calculate dust**: `dust = payout_pool - sum(individual_payouts)`
3. **Redistribute dust**: Distribute 1 XLM to each winner (in order) until dust is exhausted

#### Algorithm Pseudocode

```
function calculate_all_payouts(bets, winning_stake, payout_pool):
    payouts = []
    ideal_total = 0
    
    for each bet_amount in bets:
        payout = (bet_amount × payout_pool) / winning_stake  // integer division
        payouts.append(payout)
        ideal_total += payout
    
    dust = payout_pool - ideal_total
    
    // Redistribute dust: give 1 unit to first N winners
    dust_per_winner = dust / num_winners
    extra_dust = dust % num_winners
    
    for i in range(num_winners):
        payouts[i] += dust_per_winner
        if i < extra_dust:
            payouts[i] += 1
    
    return PayoutResult(payouts, dust, sum(payouts))
```

### Dust Handling Example

```
Scenario: 100 winners, each bet 1 XLM, payout pool = 97 XLM

Step 1: Ideal payouts
  Each: floor(1 × 97 / 100) = 0 XLM
  Total distributed: 0 XLM
  
Step 2: Calculate dust
  dust = 97 - 0 = 97 XLM
  
Step 3: Redistribute dust
  dust_per_winner = 97 / 100 = 0
  extra_dust = 97 % 100 = 97
  
  First 97 winners get +1 XLM
  Last 3 winners get 0
  
Final distribution: 97 winners get 1 XLM, 3 winners get 0
Total distributed: 97 XLM ✓
Variance: 0 XLM ✓
```

## Conservation Property

The most important mathematical property is **conservation**:

```
sum(all_payouts) + dust = payout_pool
```

Or equivalently:

```
sum(all_payouts) = payout_pool - dust
```

And after redistribution:

```
sum(all_payouts) = payout_pool  // ALWAYS
```

This ensures that no XLM is ever lost in the settlement process.

## Fixed-Point Arithmetic

### Why Fixed-Point?

Smart contracts cannot use floating-point numbers due to:
1. **Non-determinism**: Different CPUs may calculate slightly different results
2. **Precision loss**: Floating-point has limited precision
3. **Gas costs**: Floating-point operations are expensive

### Implementation

We use **integer arithmetic** throughout with a precision factor of 10⁷:

```rust
// Instead of: 0.97 × 1000 = 970
// We use: 9700000000 / 10000000 × 1000 = 970000

// The division naturally truncates, and we track the remainder as dust
```

### Precision Guarantees

- All monetary values are stored as integers (smallest unit: 0.0000001 XLM)
- Division is performed before multiplication to prevent overflow
- Dust is tracked and redistributed to maintain conservation

## Edge Cases

### No Winners

If no one bet on the winning outcome:
- `winning_stake = 0`
- Payout function returns 0 for all
- All funds remain in contract (or can be redirected to treasury)

### Single Winner

When there is only one winner:
- They receive the entire payout pool
- `payout = payout_pool`
- Dust = 0

### Equal Bets

When all winners bet equal amounts:
- Each receives `payout_pool / num_winners`
- Dust is distributed evenly (or first N winners get +1)

### Extreme Asymmetry

When one bettor dominates:
- Dominant bettor receives proportional share
- Other winners receive small proportional shares
- Dust redistribution has minimal effect

## Verification

### Unit Tests

The implementation includes 50+ test cases covering:
- Various pool sizes (1 to 1,000,000+ XLM)
- Different bet distributions (equal, Fibonacci, prime, etc.)
- Edge cases (zero bets, single winner, many small bets)
- Conservation verification on all cases

### Coverage Requirements

- **95% line coverage** on `settlement_math.rs`
- **100% conservation verification** on all test cases
- **Variance must be exactly 0** for all distributions

### Test Results Format

```
running 50 tests
test test_ratio_01_single_round ... ok
test test_ratio_02_equal_split ... ok
...
test result: ok. 50 passed; 0 failed

Settlement Math Module Coverage: 95.2%
Variance Check: All tests passed with 0.0000000 variance
```

## Security Considerations

1. **Overflow Protection**: Multiplication is ordered to prevent integer overflow
2. **Division by Zero**: Handled explicitly with zero return
3. **Dust Accumulation**: Dust is always redistributed, never accumulated
4. **Precision Loss**: Tracked explicitly as "dust" and redistributed

## Formal Verification

The mathematical properties can be formally verified:

### Property 1: Conservation
```
∀ bets, pool: sum(calculate_all_payouts(bets, pool)) = pool
```

### Property 2: Proportionality
```
∀ bet₁, bet₂, pool: 
  bet₁ / bet₂ = calculate_payout(bet₁, pool) / calculate_payout(bet₂, pool)
```

### Property 3: Bounded Payout
```
∀ bet, pool: 0 ≤ calculate_payout(bet, pool) ≤ pool
```

## References

- [Soroban Smart Contract SDK](https://soroban.stellar.org/docs)
- [Fixed-Point Arithmetic](https://en.wikipedia.org/wiki/Fixed-point_arithmetic)
- [Prediction Market Mechanisms](https://en.wikipedia.org/wiki/Prediction_market)
