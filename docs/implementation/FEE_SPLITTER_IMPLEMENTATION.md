# Fee Distribution Splitter Implementation

## Overview

Implemented a configurable fee splitter that distributes protocol fees between the DAO treasury, liquidity providers, and a burn address. This creates better tokenomics and incentive alignment.

## Implementation Details

### 1. Data Structures

#### FeeConfig Struct

```rust
pub struct FeeConfig {
    pub treasury_bps: u32,  // Basis points for DAO treasury (0-10000)
    pub lp_bps: u32,        // Basis points for liquidity providers (0-10000)
    pub burn_bps: u32,      // Basis points for burn address (0-10000)
}
```

#### Storage Keys Added

- `FeeSplitConfig` - Stores the FeeConfig in Instance storage
- `TreasuryAddress` - DAO treasury address
- `LPAddress` - Liquidity provider pool address
- `BurnAddress` - Stellar burn address (issuer with locked trustline)

### 2. Core Functions

#### configure_fee_split()

- **Purpose**: Initial configuration of fee distribution
- **Parameters**: BPS values for each destination + addresses
- **Auth**: Admin only (via check_role)
- **Validation**: Ensures treasury_bps + lp_bps + burn_bps == 10000 (100%)
- **Storage**: Writes to Instance storage with TTL extension

#### update_fee_split()

- **Purpose**: Update BPS allocation without changing addresses
- **Parameters**: New BPS values
- **Auth**: Admin only
- **Validation**: Same 100% total requirement

#### update_fee_addresses()

- **Purpose**: Update destination addresses without changing BPS
- **Parameters**: New addresses for treasury, LP, and burn
- **Auth**: Admin only

#### get_fee_split_config()

- **Purpose**: Read current configuration
- **Returns**: (FeeConfig, treasury_addr, lp_addr, burn_addr)
- **Default**: 100% to treasury if not configured

#### distribute_fee_split() [Internal]

- **Purpose**: Execute the actual fee distribution
- **Process**:
  1. Calculate split amounts using BPS (zero-float arithmetic)
  2. Transfer to treasury if amount > 0
  3. Transfer to LP pool if amount > 0
  4. Transfer to burn address if amount > 0
  5. Emit FeeSplit event for indexing
- **Formula**: `amount = (fee_amount * bps) / 10000`

### 3. Integration Points

#### batch_distribute()

Modified to:

1. Calculate fee amount from total pool
2. Call `distribute_fee_split()` on first batch (cursor == 0)
3. Distribute fees before paying winners

### 4. Zero-Float Policy Compliance

All calculations use i128 arithmetic with 7-decimal (stroop) precision:

- BPS calculations: `(amount * bps) / 10000`
- No floating point operations anywhere
- All values in stroops (1 XLM = 10,000,000 stroops)

### 5. Auth Enforcement

Every state-changing function requires authorization:

- `configure_fee_split()` - Admin via check_role
- `update_fee_split()` - Admin via check_role
- `update_fee_addresses()` - Admin via check_role
- `distribute_fee_split()` - Internal, called from authorized context

### 6. Storage Rent Management

All storage writes include TTL extension:

```rust
env.storage().instance().extend_ttl(100, 1_000_000);
```

### 7. Event Emission

Fee distribution emits event for off-chain indexing:

```rust
env.events().publish(
    (symbol_short!("FeeSplit"), fee_amount),
    (treasury_amount, lp_amount, burn_amount),
);
```

## Testing

Comprehensive test suite added:

1. **test_configure_fee_split** - Validates configuration storage
2. **test_configure_fee_split_invalid_total** - Ensures 100% requirement
3. **test_update_fee_split** - Tests BPS updates
4. **test_update_fee_addresses** - Tests address updates
5. **test_fee_distribution_on_batch_distribute** - End-to-end fee distribution

## Usage Example

```rust
// Configure 50% treasury, 30% LP, 20% burn
client.configure_fee_split(
    &5000u32,      // 50% to treasury
    &3000u32,      // 30% to LP
    &2000u32,      // 20% to burn
    &treasury_addr,
    &lp_addr,
    &burn_addr
);

// Later, update allocation to 60/25/15
client.update_fee_split(&6000u32, &2500u32, &1500u32);

// Or update addresses
client.update_fee_addresses(&new_treasury, &new_lp, &new_burn);
```

## Security Considerations

1. **BPS Validation**: Always validates total == 10000 to prevent over/under distribution
2. **Admin-Only**: All configuration changes require admin authorization
3. **Zero-Float**: No floating point operations to prevent precision loss
4. **Storage Rent**: All writes extend TTL to prevent data expiration
5. **Event Logging**: All distributions logged for transparency

## Gas Optimization

- Single storage read for config per distribution
- Conditional transfers (only if amount > 0)
- Fee distribution only on first batch to avoid redundant operations
- Instance storage for hot data (cheaper than Persistent)

## Stellar Burn Mechanism

The burn address should be:

- Token issuer account with locked trustline, OR
- Dedicated burn address that cannot sign transactions

Tokens sent to this address are effectively removed from circulation.

## Definition of Done Checklist

✅ Zero-Float Policy: Uses i128 with 7-decimal precision, no floats
✅ Auth Enforcement: All state-changing functions use require_auth()
✅ Storage Rent: All writes include extend_ttl calls
✅ BPS Split: Validates total == 10000 (100%)
✅ Multi-destination Transfer: Distributes to treasury, LP, and burn
✅ Test Coverage: Comprehensive test suite included
✅ Event Emission: FeeSplit event for off-chain indexing

## Files Modified

1. `contracts/prediction_market/src/lib.rs`
   - Added FeeConfig struct
   - Added storage keys
   - Implemented fee splitter functions
   - Modified batch_distribute to use splitter
   - Added helper functions (get_lmsr_price, get_outcome_shares, claim_refund)
   - Added module imports (lmsr, position_token)
   - Added comprehensive tests

2. `contracts/prediction_market/src/access.rs`
   - Added panic_if_paused() helper function

## Next Steps

1. Deploy updated contract to testnet
2. Configure initial fee split via admin
3. Monitor FeeSplit events for distribution verification
4. Adjust BPS allocation based on DAO governance decisions
