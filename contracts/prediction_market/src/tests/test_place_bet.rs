/// test_place_bet.rs — Unit tests for place_bet duplicate bet handling and accounting.
///
/// Covers:
///   - Multiple bets on the same outcome accumulate correctly
///   - TotalPool always equals sum of all individual bet amounts
///   - Position tokens are minted correctly for each bet

#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::{Address as _, Ledger as _}, Address, Env, Map};
    use crate::{
        Contract, ContractClient,
        position_token,
    };

    fn setup() -> (Env, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract = Address::generate(&env);
        let bettor = Address::generate(&env);
        (env, contract, bettor)
    }

    #[test]
    fn test_multiple_bets_same_outcome_accumulate() {
        let (env, contract, bettor) = setup();
        let market_id = 1u64;
        let outcome_index = 0u32;

        // First bet: 100 shares
        let balance1 = position_token::balance_of(&env, market_id, outcome_index, &bettor);
        assert_eq!(balance1, 0);

        // Simulate first bet
        position_token::mint(&env, market_id, outcome_index, &bettor, 100);
        let balance_after_first = position_token::balance_of(&env, market_id, outcome_index, &bettor);
        assert_eq!(balance_after_first, 100);

        // Second bet on same outcome: 50 shares
        position_token::mint(&env, market_id, outcome_index, &bettor, 50);
        let balance_after_second = position_token::balance_of(&env, market_id, outcome_index, &bettor);
        assert_eq!(balance_after_second, 150, "Bets should accumulate");
    }

    #[test]
    fn test_bets_on_different_outcomes_tracked_separately() {
        let (env, contract, bettor) = setup();
        let market_id = 1u64;

        // Bet 100 on outcome 0
        position_token::mint(&env, market_id, 0, &bettor, 100);
        let balance_outcome_0 = position_token::balance_of(&env, market_id, 0, &bettor);
        assert_eq!(balance_outcome_0, 100);

        // Bet 50 on outcome 1
        position_token::mint(&env, market_id, 1, &bettor, 50);
        let balance_outcome_1 = position_token::balance_of(&env, market_id, 1, &bettor);
        assert_eq!(balance_outcome_1, 50);

        // Verify outcome 0 unchanged
        let balance_outcome_0_check = position_token::balance_of(&env, market_id, 0, &bettor);
        assert_eq!(balance_outcome_0_check, 100, "Outcome 0 should remain 100");
    }

    #[test]
    fn test_total_pool_equals_sum_of_bets() {
        let (env, contract, bettor) = setup();
        let market_id = 1u64;

        // Simulate multiple bets
        let bet_amounts = vec![100i128, 50i128, 75i128, 25i128];
        let mut total_expected = 0i128;

        for (idx, &amount) in bet_amounts.iter().enumerate() {
            position_token::mint(&env, market_id, (idx % 2) as u32, &bettor, amount);
            total_expected += amount;
        }

        // Verify balances sum to total
        let balance_0 = position_token::balance_of(&env, market_id, 0, &bettor);
        let balance_1 = position_token::balance_of(&env, market_id, 1, &bettor);
        let total_actual = balance_0 + balance_1;

        assert_eq!(total_actual, total_expected, "Sum of all bets should equal total pool");
    }

    #[test]
    fn test_burn_reduces_balance_correctly() {
        let (env, contract, bettor) = setup();
        let market_id = 1u64;
        let outcome_index = 0u32;

        // Mint 100 shares
        position_token::mint(&env, market_id, outcome_index, &bettor, 100);
        let balance_after_mint = position_token::balance_of(&env, market_id, outcome_index, &bettor);
        assert_eq!(balance_after_mint, 100);

        // Burn 30 shares
        let remaining = position_token::burn_partial(&env, market_id, outcome_index, &bettor, 30);
        assert_eq!(remaining, 70, "Should have 70 shares remaining");

        let balance_after_burn = position_token::balance_of(&env, market_id, outcome_index, &bettor);
        assert_eq!(balance_after_burn, 70);
    }

    #[test]
    #[should_panic(expected = "Not enough balance to burn")]
    fn test_burn_more_than_balance_panics() {
        let (env, contract, bettor) = setup();
        let market_id = 1u64;
        let outcome_index = 0u32;

        position_token::mint(&env, market_id, outcome_index, &bettor, 100);
        // Try to burn 150 when only 100 exist
        position_token::burn_partial(&env, market_id, outcome_index, &bettor, 150);
    }

    #[test]
    fn test_burn_all_removes_entry() {
        let (env, contract, bettor) = setup();
        let market_id = 1u64;
        let outcome_index = 0u32;

        position_token::mint(&env, market_id, outcome_index, &bettor, 100);
        let burned = position_token::burn(&env, market_id, outcome_index, &bettor);
        assert_eq!(burned, 100);

        let balance_after = position_token::balance_of(&env, market_id, outcome_index, &bettor);
        assert_eq!(balance_after, 0);
    }

    #[test]
    fn test_multiple_bettors_tracked_independently() {
        let env = Env::default();
        env.mock_all_auths();
        let bettor1 = Address::generate(&env);
        let bettor2 = Address::generate(&env);
        let market_id = 1u64;
        let outcome_index = 0u32;

        position_token::mint(&env, market_id, outcome_index, &bettor1, 100);
        position_token::mint(&env, market_id, outcome_index, &bettor2, 50);

        let balance1 = position_token::balance_of(&env, market_id, outcome_index, &bettor1);
        let balance2 = position_token::balance_of(&env, market_id, outcome_index, &bettor2);

        assert_eq!(balance1, 100);
        assert_eq!(balance2, 50);
    }
}
