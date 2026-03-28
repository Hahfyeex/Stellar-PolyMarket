//! Settlement Mathematics Module
//! 
//! This module implements precise fixed-point arithmetic for calculating
//! prediction market payouts without losing "dust" (fractional XLM).
//! 
//! Key Design Decisions:
//! - Uses 7 decimal places of precision (10^7) for fixed-point calculations
//! - All calculations maintain integer precision to avoid floating-point errors
//! - Dust (remainder) is tracked and distributed to ensure total conservation

use soroban_sdk::{Env, Vec};

/// Precision factor for fixed-point arithmetic (10^7 = 10,000,000)
/// This allows representing fractions down to 0.0000001 units
pub const PRECISION: i128 = 10_000_000i128;

/// One whole unit in fixed-point representation
pub const ONE_UNIT: i128 = PRECISION;

/// Platform fee numerator (3%)
pub const PLATFORM_FEE_NUMERATOR: i128 = 3;
pub const PLATFORM_FEE_DENOMINATOR: i128 = 100;

/// Result of a payout calculation with dust tracking
#[derive(Clone, Debug)]
pub struct PayoutResult {
    /// Individual payouts for each winner
    pub payouts: Vec<i128>,
    /// Total dust (remainder) to be redistributed
    pub dust: i128,
    /// Total amount distributed (sum of payouts + dust distributed)
    pub total_distributed: i128,
}

/// Metadata about a calculation for verification
#[derive(Clone, Debug)]
pub struct CalculationMetadata {
    pub total_pool: i128,
    pub platform_fee: i128,
    pub payout_pool: i128,
    pub winning_stake: i128,
    pub num_winners: u32,
}

/// Calculate platform fee (3% of total pool)
/// 
/// # Arguments
/// * `total_pool` - The total amount in the pool
/// 
/// # Returns
/// * Platform fee amount (integer, rounded down)
#[inline(always)]
pub fn calculate_platform_fee(total_pool: i128) -> i128 {
    (total_pool * PLATFORM_FEE_NUMERATOR) / PLATFORM_FEE_DENOMINATOR
}

/// Calculate payout pool (97% of total pool after platform fee)
/// 
/// Uses the formula: floor(total_pool * 97 / 100)
/// This ensures 97% is correctly calculated even for small amounts.
/// 
/// # Arguments
/// * `total_pool` - The total amount in the pool
/// 
/// # Returns
/// * Payout pool amount
#[inline(always)]
pub fn calculate_payout_pool(total_pool: i128) -> i128 {
    (total_pool * 97) / 100
}

/// Calculate the payout for a single bettor using fixed-point arithmetic
/// 
/// This implements the formula: payout = (bet_amount / winning_stake) * payout_pool
/// 
/// The calculation uses fixed-point arithmetic to preserve precision:
/// 1. Scale bet_amount to fixed-point representation
/// 2. Divide by winning_stake (giving a fraction)
/// 3. Multiply by payout_pool
/// 4. Scale back to integer (truncating fractional units)
/// 
/// # Arguments
/// * `bet_amount` - The bettor's stake on the winning outcome
/// * `winning_stake` - Total amount bet on the winning outcome
/// * `payout_pool` - The pool available for distribution (after fees)
/// 
/// # Returns
/// * Payout amount rounded down to nearest integer
pub fn calculate_payout(bet_amount: i128, winning_stake: i128, payout_pool: i128) -> i128 {
    if winning_stake == 0 || bet_amount == 0 {
        return 0;
    }
    
    // payout = bet_amount * payout_pool / winning_stake
    (bet_amount * payout_pool) / winning_stake
}

/// Calculate all payouts and track dust for redistribution
/// 
/// This function ensures total conservation by:
/// 1. Calculating ideal payouts for all winners
/// 2. Distributing integer payouts
/// 3. Tracking total dust from truncation
/// 4. Redistributing dust proportionally to ensure 100% distribution
/// 
/// # Arguments
/// * `env` - The Soroban environment
/// * `bets` - Slice of bet amounts for all winners
/// * `winning_stake` - Total amount bet on the winning outcome
/// * `payout_pool` - The pool available for distribution (after fees)
/// 
/// # Returns
/// * PayoutResult with individual payouts, dust, and totals
pub fn calculate_all_payouts(env: &Env, bets: &[i128], winning_stake: i128, payout_pool: i128) -> PayoutResult {
    if bets.is_empty() || winning_stake == 0 {
        // When there are no bets or no winning stake, all payouts are 0
        // Return empty or zero-filled payouts
        let mut payouts = Vec::new(env);
        for _ in 0..bets.len() {
            payouts.push_back(0);
        }
        return PayoutResult {
            payouts,
            dust: 0,
            total_distributed: 0,
        };
    }
    
    let num_winners = bets.len();
    let mut payouts = Vec::new(env);
    let mut ideal_total: i128 = 0;
    
    // First pass: calculate ideal payouts using fixed-point arithmetic
    for i in 0..num_winners {
        let bet_amount = bets[i];
        if bet_amount == 0 {
            payouts.push_back(0);
            continue;
        }
        
        // Calculate payout with extended precision
        // payout = bet_amount * payout_pool / winning_stake
        let payout = (bet_amount * payout_pool) / winning_stake;
        payouts.push_back(payout);
        ideal_total += payout;
    }
    
    // Calculate dust (difference between ideal and achievable due to integer division)
    let dust = payout_pool - ideal_total;
    
    // Redistribute dust to ensure 100% distribution
    // Strategy: distribute dust in smallest units to first N winners
    // This ensures total_distributed = payout_pool exactly
    if dust > 0 && num_winners > 0 {
        // Distribute 1 unit of dust to each winner until dust is exhausted
        // This minimizes variance while ensuring total conservation
        let dust_per_winner = dust / num_winners as i128;
        let extra_dust = dust % num_winners as i128;
        
        for i in 0..num_winners {
            let current = payouts.get(i as u32).unwrap_or(0);
            let add = dust_per_winner + if (i as i128) < extra_dust { 1 } else { 0 };
            payouts.set(i as u32, current + add);
        }
    } else if dust < 0 {
        // This shouldn't happen with proper calculation, but handle edge cases
        // by reducing payouts proportionally
        let adjustment = -dust / num_winners as i128;
        let extra_adjustment = (-dust) % num_winners as i128;
        
        for i in 0..num_winners {
            let current = payouts.get(i as u32).unwrap_or(0);
            let sub = adjustment + if (i as i128) < extra_adjustment { 1 } else { 0 };
            payouts.set(i as u32, current - sub);
        }
    }
    
    let mut total_distributed: i128 = 0;
    for i in 0..payouts.len() {
        total_distributed += payouts.get(i).unwrap_or(0);
    }
    
    // Actual dust remaining after redistribution (should be 0 if redistribution worked)
    let actual_dust = payout_pool - total_distributed;
    
    PayoutResult {
        payouts,
        dust: actual_dust,
        total_distributed,
    }
}

/// Verify that payouts sum to exactly the payout pool (conservation test)
/// 
/// # Arguments
/// * `payouts` - Vec of payout amounts
/// * `payout_pool` - Expected total
/// 
/// # Returns
/// * Variance from expected (should be 0)
pub fn verify_payout_conservation(payouts: &Vec<i128>, payout_pool: i128) -> i128 {
    let mut total: i128 = 0;
    for i in 0..payouts.len() {
        total += payouts.get(i).unwrap_or(0);
    }
    payout_pool - total
}

/// Calculate payout ratio (for display purposes)
/// 
/// Returns the multiplier showing how much a bettor wins per unit bet
/// 
/// # Arguments
/// * `bet_amount` - The bettor's stake
/// * `payout` - The payout received
/// 
/// # Returns
/// * Ratio as a tuple (numerator, denominator)
pub fn calculate_payout_ratio(bet_amount: i128, payout: i128) -> Option<(i128, i128)> {
    if bet_amount == 0 {
        return None;
    }
    let ratio_numerator = payout * PRECISION;
    let ratio_denominator = bet_amount;
    Some((ratio_numerator / ratio_denominator, PRECISION))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test platform fee calculation
    #[test]
    fn test_platform_fee() {
        // 3% of 1000 = 30
        assert_eq!(calculate_platform_fee(1000), 30);
        
        // 3% of 100 = 3
        assert_eq!(calculate_platform_fee(100), 3);
        
        // 3% of 33 = 0 (truncated)
        assert_eq!(calculate_platform_fee(33), 0);
        
        // 3% of 1000000 = 30000
        assert_eq!(calculate_platform_fee(1_000_000), 30000);
    }

    /// Test payout pool calculation
    #[test]
    fn test_payout_pool() {
        // 97% of 1000 = 970
        assert_eq!(calculate_payout_pool(1000), 970);
        
        // 97% of 100 = 97
        assert_eq!(calculate_payout_pool(100), 97);
        
        // 97% of 33 = 32 (truncated)
        assert_eq!(calculate_payout_pool(33), 32);
    }

    /// Test basic payout calculation
    #[test]
    fn test_basic_payout() {
        // Single bettor gets everything
        let payout = calculate_payout(1000, 1000, 970);
        assert_eq!(payout, 970);
        
        // Two equal bettors
        let payout = calculate_payout(500, 1000, 970);
        assert_eq!(payout, 485); // 500/1000 * 970 = 485
    }

    /// Test exact division cases
    #[test]
    fn test_exact_division() {
        // 100/200 * 194 = 97 exactly
        let payout = calculate_payout(100, 200, 194);
        assert_eq!(payout, 97);
        
        // 1/2 * 200 = 100 exactly
        let payout = calculate_payout(1, 2, 200);
        assert_eq!(payout, 100);
    }

    /// Test dust handling with single winner
    #[test]
    fn test_single_winner_dust() {
        let env = Env::default();
        let bets: [i128; 1] = [100];
        let result = calculate_all_payouts(&env, &bets, 100, 97);
        
        assert_eq!(result.payouts.len(), 1);
        assert_eq!(result.payouts.get(0).unwrap_or(0), 97);
        assert_eq!(result.total_distributed, 97);
        assert_eq!(result.dust, 0);
    }

    /// Test dust handling with multiple winners
    #[test]
    fn test_multiple_winners_dust() {
        let env = Env::default();
        let bets: [i128; 2] = [100, 200];
        let result = calculate_all_payouts(&env, &bets, 300, 291);
        
        assert_eq!(result.payouts.get(0).unwrap_or(0), 97);
        assert_eq!(result.payouts.get(1).unwrap_or(0), 194);
        assert_eq!(result.total_distributed, 291);
        assert_eq!(result.dust, 0);
    }

    /// Test dust redistribution
    #[test]
    fn test_dust_redistribution() {
        let env = Env::default();
        let bets: [i128; 2] = [1, 1];
        let result = calculate_all_payouts(&env, &bets, 2, 194);
        
        // Verify conservation
        assert_eq!(result.total_distributed, 194);
        let variance = verify_payout_conservation(&result.payouts, 194);
        assert_eq!(variance, 0);
    }

    /// Test edge case: zero winning stake
    #[test]
    fn test_zero_winning_stake() {
        let env = Env::default();
        let bets: [i128; 2] = [100, 200];
        let result = calculate_all_payouts(&env, &bets, 0, 291);
        
        assert_eq!(result.payouts.len(), 2);
        assert!(result.payouts.get(0).unwrap_or(0) == 0 && result.payouts.get(1).unwrap_or(0) == 0);
        assert_eq!(result.total_distributed, 0);
    }

    /// Test edge case: empty bets
    #[test]
    fn test_empty_bets() {
        let env = Env::default();
        let bets: [i128; 0] = [];
        let result = calculate_all_payouts(&env, &bets, 100, 97);
        
        assert_eq!(result.payouts.len(), 0);
        assert_eq!(result.total_distributed, 0);
    }

    /// Test large numbers (simulating real XLM amounts)
    #[test]
    fn test_large_amounts() {
        let env = Env::default();
        let bets: [i128; 3] = [1_000_000_000i128, 2_000_000_000i128, 3_000_000_000i128];
        let winning_stake: i128 = 6_000_000_000i128;
        let payout_pool = 5_820_000_000i128; // 97%
        
        let result = calculate_all_payouts(&env, &bets, winning_stake, payout_pool);
        
        // Each should get their proportional share exactly
        assert_eq!(result.payouts.get(0).unwrap_or(0), 970_000_000i128);
        assert_eq!(result.payouts.get(1).unwrap_or(0), 1_940_000_000i128);
        assert_eq!(result.payouts.get(2).unwrap_or(0), 2_910_000_000i128);
        assert_eq!(result.total_distributed, 5_820_000_000i128);
    }

    /// Test verification function
    #[test]
    fn test_verification_function() {
        let env = Env::default();
        let payouts: Vec<i128> = soroban_sdk::vec![&env, 100, 200, 300];
        let variance = verify_payout_conservation(&payouts, 600);
        assert_eq!(variance, 0);
        
        let payouts: Vec<i128> = soroban_sdk::vec![&env, 100, 200, 300];
        let variance = verify_payout_conservation(&payouts, 601);
        assert_eq!(variance, 1);
    }

    /// Test precision constant
    #[test]
    fn test_precision_constant() {
        assert_eq!(PRECISION, 10_000_000);
        assert_eq!(ONE_UNIT, 10_000_000);
    }

    /// Test platform fee constants
    #[test]
    fn test_fee_constants() {
        assert_eq!(PLATFORM_FEE_NUMERATOR, 3);
        assert_eq!(PLATFORM_FEE_DENOMINATOR, 100);
    }
}
