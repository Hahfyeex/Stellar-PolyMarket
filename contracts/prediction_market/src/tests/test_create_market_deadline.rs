#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};
    use crate::{Contract, ContractClient, MIN_MARKET_DURATION_SECONDS};

    #[test]
    fn test_create_market_with_deadline_less_than_one_hour() {
        let env = Env::default();
        let contract_id = env.register_contract(None, Contract);
        let client = ContractClient::new(&env, &contract_id);
        
        let creator = Address::random(&env);
        let token = Address::random(&env);
        
        env.mock_all_auths();
        
        let mut options = Vec::new(&env);
        options.push_back(String::from_slice(&env, "Yes"));
        options.push_back(String::from_slice(&env, "No"));
        
        // #378: Deadline less than 1 hour from now should fail
        let deadline = env.ledger().timestamp() + MIN_MARKET_DURATION_SECONDS - 1;
        
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
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
        }));
        
        assert!(result.is_err(), "Should panic when deadline < 1 hour from now");
    }

    #[test]
    fn test_create_market_with_deadline_exactly_one_hour() {
        let env = Env::default();
        let contract_id = env.register_contract(None, Contract);
        let client = ContractClient::new(&env, &contract_id);
        
        let creator = Address::random(&env);
        let token = Address::random(&env);
        
        env.mock_all_auths();
        
        let mut options = Vec::new(&env);
        options.push_back(String::from_slice(&env, "Yes"));
        options.push_back(String::from_slice(&env, "No"));
        
        // #378: Deadline exactly 1 hour from now should succeed
        let deadline = env.ledger().timestamp() + MIN_MARKET_DURATION_SECONDS;
        
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
        
        // If we reach here, the market was created successfully
    }

    #[test]
    fn test_create_market_with_deadline_more_than_one_hour() {
        let env = Env::default();
        let contract_id = env.register_contract(None, Contract);
        let client = ContractClient::new(&env, &contract_id);
        
        let creator = Address::random(&env);
        let token = Address::random(&env);
        
        env.mock_all_auths();
        
        let mut options = Vec::new(&env);
        options.push_back(String::from_slice(&env, "Yes"));
        options.push_back(String::from_slice(&env, "No"));
        
        // #378: Deadline more than 1 hour from now should succeed
        let deadline = env.ledger().timestamp() + MIN_MARKET_DURATION_SECONDS + 3600;
        
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
        
        // If we reach here, the market was created successfully
    }
}
