#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};
    use crate::{Contract, ContractClient};

    #[test]
    fn test_place_bet_with_invalid_option_index() {
        let env = Env::default();
        let contract_id = env.register_contract(None, Contract);
        let client = ContractClient::new(&env, &contract_id);
        
        let creator = Address::random(&env);
        let bettor = Address::random(&env);
        let token = Address::random(&env);
        
        env.mock_all_auths();
        
        let mut options = Vec::new(&env);
        options.push_back(String::from_slice(&env, "Yes"));
        options.push_back(String::from_slice(&env, "No"));
        
        let deadline = env.ledger().timestamp() + 3600;
        
        client.create_market(
            &creator,
            &1u64,
            &String::from_slice(&env, "Test market"),
            &options,
            &deadline,
            &token,
            &1000i128,
            &None,
            &None,
        );
        
        // #375: Attempt to place bet with option_index >= market.options.len()
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.place_bet(&1u64, &2u32, &bettor, &100i128);
        }));
        
        assert!(result.is_err(), "Should panic when option_index >= options.len()");
    }

    #[test]
    fn test_place_bet_with_last_valid_index() {
        let env = Env::default();
        let contract_id = env.register_contract(None, Contract);
        let client = ContractClient::new(&env, &contract_id);
        
        let creator = Address::random(&env);
        let bettor = Address::random(&env);
        let token = Address::random(&env);
        
        env.mock_all_auths();
        
        let mut options = Vec::new(&env);
        options.push_back(String::from_slice(&env, "Yes"));
        options.push_back(String::from_slice(&env, "No"));
        
        let deadline = env.ledger().timestamp() + 3600;
        
        client.create_market(
            &creator,
            &1u64,
            &String::from_slice(&env, "Test market"),
            &options,
            &deadline,
            &token,
            &1000i128,
            &None,
            &None,
        );
        
        // #375: Place bet with option_index = options.len() - 1 (last valid index)
        // This should succeed
        client.place_bet(&1u64, &1u32, &bettor, &100i128);
    }

    #[test]
    fn test_market_with_insufficient_options_at_bet_time() {
        let env = Env::default();
        let contract_id = env.register_contract(None, Contract);
        let client = ContractClient::new(&env, &contract_id);
        
        let creator = Address::random(&env);
        let bettor = Address::random(&env);
        let token = Address::random(&env);
        
        env.mock_all_auths();
        
        let mut options = Vec::new(&env);
        options.push_back(String::from_slice(&env, "Yes"));
        options.push_back(String::from_slice(&env, "No"));
        
        let deadline = env.ledger().timestamp() + 3600;
        
        client.create_market(
            &creator,
            &1u64,
            &String::from_slice(&env, "Test market"),
            &options,
            &deadline,
            &token,
            &1000i128,
            &None,
            &None,
        );
        
        // #375: Verify market has at least 2 options at bet time
        // This should succeed since we created with 2 options
        client.place_bet(&1u64, &0u32, &bettor, &100i128);
    }
}
