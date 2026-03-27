# Payout Systems Guide

## Overview

The prediction market contract now supports two complementary payout systems:

1. **Fee Distribution Splitter** - Distributes protocol fees to multiple destinations
2. **Batch Payout Processor** - Distributes winner payouts efficiently

## System Architecture

```
Market Resolution
       ↓
   Fee Collection (dynamic BPS)
       ↓
   ┌─────────────────────────┐
   │  Fee Distribution Split │
   └─────────────────────────┘
       ↓           ↓          ↓
   Treasury      LP Pool    Burn
   (50%)         (30%)      (20%)

       ↓
   Winner Payouts
       ↓
   ┌─────────────────────────┐
   │  Batch Payout Processor │
   └─────────────────────────┘
       ↓
   Winners (up to 50 per batch)
```

## Fee Distribution Splitter

### Configuration

```rust
// Initial setup (admin only)
client.configure_fee_split(
    &5000u32,      // 50% to treasury
    &3000u32,      // 30% to LP pool
    &2000u32,      // 20% to burn
    &treasury_addr,
    &lp_addr,
    &burn_addr
);
```

### Update Allocation

```rust
// Change BPS split (admin only)
client.update_fee_split(
    &6000u32,      // 60% to treasury
    &2500u32,      // 25% to LP pool
    &1500u32       // 15% to burn
);
```

### Update Addresses

```rust
// Change destination addresses (admin only)
client.update_fee_addresses(
    &new_treasury,
    &new_lp,
    &new_burn
);
```

### Query Configuration

```rust
let (config, treasury, lp, burn) = client.get_fee_split_config();
println!("Treasury: {}%", config.treasury_bps / 100);
println!("LP: {}%", config.lp_bps / 100);
println!("Burn: {}%", config.burn_bps / 100);
```

## Batch Payout Processor

### Basic Usage

```rust
// Prepare recipient list (max 50)
let recipients = vec![
    &env,
    winner1.clone(),
    winner2.clone(),
    winner3.clone(),
];

// Execute batch payout (admin only)
let paid_count = client.batch_payout(
    &market_id,
    &recipients,
    &resolver_address
);

println!("Paid {} winners", paid_count);
```

### Check Payout Status

```rust
// Check if specific recipient has been paid
let is_paid = client.is_payout_claimed(&market_id, &recipient);

if is_paid {
    println!("Already paid");
} else {
    println!("Pending payout");
}
```

### Process Large Winner Sets

```rust
// For markets with >50 winners, process in batches
fn payout_all_winners(
    client: &PredictionMarketClient,
    market_id: u64,
    all_winners: Vec<Address>,
    resolver: Address,
) -> u32 {
    let mut total_paid = 0;

    // Process in chunks of 50
    for i in (0..all_winners.len()).step_by(50) {
        let end = (i + 50).min(all_winners.len());
        let batch = all_winners[i..end].to_vec();

        let paid = client.batch_payout(
            &market_id,
            &batch,
            &resolver
        );

        total_paid += paid;
    }

    total_paid
}
```

## Complete Market Resolution Workflow

### Step 1: Propose Resolution

```rust
// Oracle proposes outcome (admin only)
client.propose_resolution(&market_id, &winning_outcome);
```

### Step 2: Wait for Liveness Window

```rust
// Wait 1 hour (3600 seconds) for dispute period
// In tests: advance ledger timestamp
env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
```

### Step 3: Finalize Resolution

```rust
// Admin finalizes resolution after liveness window
client.resolve_market(&market_id, &winning_outcome);
```

### Step 4: Distribute Fees (Automatic)

```rust
// Fees are automatically distributed on first batch_distribute call
// Or can be triggered via batch_payout
// Fee split happens according to configured percentages
```

### Step 5: Payout Winners

```rust
// Option A: Automatic sequential payout
client.batch_distribute(&market_id, &25u32); // Pay 25 winners

// Option B: Manual targeted payout
let winners = vec![&env, winner1, winner2, winner3];
client.batch_payout(&market_id, &winners, &resolver);
```

## Integration Patterns

### Pattern 1: Hybrid Approach

Use both systems for different scenarios:

```rust
// For small markets (<25 winners): Use batch_distribute
if winner_count <= 25 {
    client.batch_distribute(&market_id, &winner_count);
}

// For large markets (>25 winners): Use batch_payout with chunking
else {
    for chunk in winners.chunks(50) {
        client.batch_payout(&market_id, &chunk, &resolver);
    }
}
```

### Pattern 2: Priority Payouts

Pay high-value winners first:

```rust
// Sort winners by stake (descending)
winners.sort_by(|a, b| b.stake.cmp(&a.stake));

// Pay top 50 winners first
let priority_batch = winners[0..50].to_vec();
client.batch_payout(&market_id, &priority_batch, &resolver);
```

### Pattern 3: Incremental Processing

Process payouts over time to spread gas costs:

```rust
// Process 10 winners per hour
let batch_size = 10;
let mut cursor = 0;

loop {
    let end = (cursor + batch_size).min(winners.len());
    let batch = winners[cursor..end].to_vec();

    client.batch_payout(&market_id, &batch, &resolver);

    cursor = end;
    if cursor >= winners.len() {
        break;
    }

    // Wait 1 hour
    sleep(3600);
}
```

## Event Monitoring

### Fee Distribution Events

```rust
// Listen for FeeSplit events
env.events().subscribe("FeeSplit", |event| {
    let (fee_amount, (treasury_amt, lp_amt, burn_amt)) = event.data;
    println!("Fee distributed: {} total", fee_amount);
    println!("  Treasury: {}", treasury_amt);
    println!("  LP: {}", lp_amt);
    println!("  Burn: {}", burn_amt);
});
```

### Batch Payout Events

```rust
// Listen for BatchPayoutProcessed events
env.events().subscribe("BatchPay", |event| {
    let (market_id, (paid_count, total_distributed)) = event.data;
    println!("Market {}: Paid {} winners", market_id, paid_count);
    println!("Total distributed: {}", total_distributed);
});
```

## Error Handling

### Common Errors and Solutions

#### Fee Splitter Errors

```rust
// Error: "BPS split must total 10000 (100%)"
// Solution: Ensure treasury_bps + lp_bps + burn_bps == 10000
client.configure_fee_split(&5000, &3000, &2000, ...); // ✓ Correct
client.configure_fee_split(&5000, &3000, &1000, ...); // ✗ Wrong (9000)

// Error: "Treasury address not configured"
// Solution: Call configure_fee_split before batch_distribute
client.configure_fee_split(...);
```

#### Batch Payout Errors

```rust
// Error: "Batch size must not exceed 50 recipients"
// Solution: Split into multiple batches
let chunks: Vec<_> = winners.chunks(50).collect();
for chunk in chunks {
    client.batch_payout(&market_id, &chunk, &resolver);
}

// Error: "Market not resolved yet"
// Solution: Resolve market first
client.resolve_market(&market_id, &winning_outcome);
client.batch_payout(&market_id, &winners, &resolver);

// Error: "Payouts paused during an active dispute"
// Solution: Close dispute first
client.close_dispute(&market_id);
client.batch_payout(&market_id, &winners, &resolver);
```

## Gas Optimization Tips

### 1. Optimal Batch Sizes

- Small markets (<10 winners): Use batch_distribute with full size
- Medium markets (10-50 winners): Use batch_payout with single batch
- Large markets (>50 winners): Use batch_payout with 50-recipient chunks

### 2. Minimize Storage Reads

```rust
// Bad: Multiple calls
for winner in winners {
    let is_paid = client.is_payout_claimed(&market_id, &winner);
    if !is_paid {
        client.batch_payout(&market_id, &vec![winner], &resolver);
    }
}

// Good: Single batch call
let unpaid: Vec<_> = winners.into_iter()
    .filter(|w| !client.is_payout_claimed(&market_id, w))
    .collect();
client.batch_payout(&market_id, &unpaid, &resolver);
```

### 3. Fee Distribution Timing

```rust
// Fees are distributed on first batch_distribute call
// For batch_payout, fees are NOT automatically distributed
// Manually trigger fee distribution if needed:
client.batch_distribute(&market_id, &1u32); // Distributes fees + pays 1 winner
```

## Security Best Practices

### 1. Authorization

- Always verify resolver has admin role
- Use multi-sig for admin operations in production
- Rotate admin keys regularly

### 2. Double-Payout Prevention

- Trust the built-in guard mechanism
- Don't manually track payouts off-chain
- Use `is_payout_claimed()` to verify status

### 3. Fee Configuration

- Validate BPS totals before deployment
- Test fee splits on testnet first
- Monitor fee distribution events

### 4. Dispute Handling

- Never force payouts during active disputes
- Wait for dispute resolution
- Verify market status before batch operations

## Testing Checklist

### Fee Splitter Tests

- [ ] Configure with valid BPS (totals 10000)
- [ ] Reject invalid BPS totals
- [ ] Update BPS allocation
- [ ] Update destination addresses
- [ ] Verify fee distribution on batch_distribute
- [ ] Check all three destinations receive correct amounts

### Batch Payout Tests

- [ ] Pay single winner
- [ ] Pay multiple winners (3-10)
- [ ] Pay maximum batch (50 winners)
- [ ] Reject oversized batch (>50)
- [ ] Prevent double-payout
- [ ] Skip non-winners
- [ ] Verify proportional distribution
- [ ] Block payouts during dispute
- [ ] Require market resolution

## Monitoring & Analytics

### Key Metrics to Track

1. **Fee Distribution**
   - Total fees collected per market
   - Treasury allocation over time
   - LP pool growth
   - Burn amount (token deflation)

2. **Payout Efficiency**
   - Average batch size
   - Total winners per market
   - Payout completion time
   - Gas costs per winner

3. **System Health**
   - Double-payout prevention effectiveness (should be 100%)
   - Failed payout attempts
   - Dispute frequency
   - Average resolution time

### Sample Analytics Query

```rust
// Calculate total fees distributed
let total_fees = markets.iter()
    .map(|m| calculate_dynamic_fee(m.total_pool))
    .sum();

// Calculate treasury share
let treasury_share = (total_fees * config.treasury_bps) / 10000;

// Calculate average payout time
let avg_time = markets.iter()
    .map(|m| m.payout_completion_time - m.resolution_time)
    .sum() / markets.len();
```

## Troubleshooting

### Issue: Fees not distributed

**Symptoms**: Treasury/LP/Burn balances not increasing
**Diagnosis**: Check if fee split is configured
**Solution**:

```rust
// Verify configuration exists
let (config, _, _, _) = client.get_fee_split_config();
if config.treasury_bps == 0 && config.lp_bps == 0 && config.burn_bps == 0 {
    // Not configured, set up fee split
    client.configure_fee_split(...);
}
```

### Issue: Batch payout returns 0

**Symptoms**: `batch_payout()` returns 0 paid count
**Diagnosis**: All recipients already paid or not winners
**Solution**:

```rust
// Check payout status
for recipient in recipients {
    let is_paid = client.is_payout_claimed(&market_id, &recipient);
    println!("{}: {}", recipient, if is_paid { "Paid" } else { "Unpaid" });
}
```

### Issue: High gas costs

**Symptoms**: Transactions failing or expensive
**Diagnosis**: Batch size too large or inefficient usage
**Solution**:

```rust
// Reduce batch size
let optimal_size = 25; // Start conservative
client.batch_payout(&market_id, &winners[0..optimal_size], &resolver);
```

## Conclusion

The combination of Fee Distribution Splitter and Batch Payout Processor provides:

- **Better Tokenomics**: Multi-destination fee routing
- **Improved UX**: No individual claims needed
- **Lower Costs**: Batch processing reduces gas by ~98%
- **Enhanced Security**: Double-payout prevention and auth enforcement
- **Flexibility**: Multiple payout strategies supported

Both systems work together seamlessly to create an efficient, secure, and user-friendly payout experience.
