#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Env as _, Env, Address};

    #[test]
    fn test_zero_amount_bet() {
        let env = Env::default();
        let bettor = Address::random(&env);
        let market_id = 1;
        let option_index = 0;

        // Initialize market with dummy data
        let market = Market {
            id: market_id,
            question: "Test Market".into(),
            options: vec!["Option 1".into(), "Option 2".into()],
            deadline: env.ledger().timestamp() + 3600,
            resolved: false,
            status: MarketStatus::Active,
            winning_outcome: 0,
            token: Address::random(&env),
            proposed_outcome: None,
            proposal_timestamp: 0,
            condition_market_id: None,
            condition_outcome: None,
        };
        env.storage().persistent().set(&DataKey::Market(market_id), &market);

        // Attempt to place a zero-amount bet
        let result = std::panic::catch_unwind(|| {
            PredictionMarket::internal_place_bet(env.clone(), market_id, option_index, bettor.clone(), 0i128);
        });
        assert!(result.is_err(), "Zero-amount bet did not panic as expected");
    }

    #[test]
    fn test_minimum_valid_bet() {
        let env = Env::default();
        let bettor = Address::random(&env);
        let market_id = 1;
        let option_index = 0;

        // Initialize market with dummy data
        let market = Market {
            id: market_id,
            question: "Test Market".into(),
            options: vec!["Option 1".into(), "Option 2".into()],
            deadline: env.ledger().timestamp() + 3600,
            resolved: false,
            status: MarketStatus::Active,
            winning_outcome: 0,
            token: Address::random(&env),
            proposed_outcome: None,
            proposal_timestamp: 0,
            condition_market_id: None,
            condition_outcome: None,
        };
        env.storage().persistent().set(&DataKey::Market(market_id), &market);

        // Place a minimum valid bet
        let min_bet = 1i128;
        env.storage().instance().set(&DataKey::MinBetAmount, &min_bet);

        PredictionMarket::internal_place_bet(env.clone(), market_id, option_index, bettor.clone(), min_bet);

        // Verify bet was placed successfully (no panic)
        let total_pool: i128 = env.storage().persistent().get(&DataKey::TotalPool(market_id)).unwrap();
        assert_eq!(total_pool, min_bet, "Minimum valid bet was not recorded correctly");
    }
}