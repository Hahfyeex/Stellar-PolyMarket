#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Map, String, Vec,
};

#[contracttype]
pub enum DataKey {
    Initialized,
    Admin,
    Market(u64),
    Bets(u64),
    TotalPool(u64),
    WhitelistedTokens,
}

#[contracttype]
#[derive(Clone)]
pub struct Market {
    pub id: u64,
    pub question: String,
    pub options: Vec<String>,  // renamed from outcomes for clarity per issue spec
    pub deadline: u64,         // renamed from end_date per issue spec
    pub resolved: bool,
    pub winning_outcome: u32,
    pub token: Address,
}

#[contract]
pub struct PredictionMarket;

/// Guard: panics if the contract has already been initialized.
fn check_initialized(env: &Env) {
    let is_init: bool = env
        .storage()
        .instance()
        .get(&DataKey::Initialized)
        .unwrap_or(false);
    assert!(!is_init, "Contract already initialized");
}

#[contractimpl]
impl PredictionMarket {
    /// Initialize contract with admin address.
    /// Uses check_initialized guard to prevent double-initialization.
    pub fn initialize(env: Env, admin: Address) {
        check_initialized(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Admin, &admin);
        // Initialize an empty whitelisted-tokens set
        env.storage()
            .instance()
            .set(&DataKey::WhitelistedTokens, &Vec::<Address>::new(&env));
    }

    /// Add a token to the whitelist. Admin-only.
    pub fn add_whitelisted_token(env: Env, token_address: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut tokens: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::WhitelistedTokens)
            .unwrap_or(Vec::new(&env));

        // Prevent duplicates
        for i in 0..tokens.len() {
            if tokens.get(i).unwrap() == token_address {
                panic!("Token already whitelisted");
            }
        }

        tokens.push_back(token_address);
        env.storage()
            .instance()
            .set(&DataKey::WhitelistedTokens, &tokens);
    }

    /// Remove a token from the whitelist. Admin-only.
    pub fn remove_whitelisted_token(env: Env, token_address: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let tokens: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::WhitelistedTokens)
            .unwrap_or(Vec::new(&env));

        let mut new_tokens = Vec::new(&env);
        let mut found = false;
        for i in 0..tokens.len() {
            let t = tokens.get(i).unwrap();
            if t == token_address {
                found = true;
            } else {
                new_tokens.push_back(t);
            }
        }
        assert!(found, "Token not found in whitelist");

        env.storage()
            .instance()
            .set(&DataKey::WhitelistedTokens, &new_tokens);
    }

    /// Query the current whitelisted tokens.
    pub fn get_whitelisted_tokens(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::WhitelistedTokens)
            .unwrap_or(Vec::new(&env))
    }

    /// Check whether a specific token is whitelisted.
    pub fn is_token_whitelisted(env: Env, token_address: Address) -> bool {
        let tokens: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::WhitelistedTokens)
            .unwrap_or(Vec::new(&env));
        for i in 0..tokens.len() {
            if tokens.get(i).unwrap() == token_address {
                return true;
            }
        }
        false
    }

    /// Create a new prediction market.
    /// Market metadata (question, options, deadline) stored in persistent storage.
    /// The token must be whitelisted before it can be used for a market.
    pub fn create_market(
        env: Env,
        id: u64,
        question: String,
        options: Vec<String>,
        deadline: u64,
        token: Address,
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        assert!(
            !env.storage().persistent().has(&DataKey::Market(id)),
            "Market already exists"
        );
        assert!(options.len() >= 2, "Need at least 2 options");
        assert!(
            deadline > env.ledger().timestamp(),
            "Deadline must be in the future"
        );

        // Enforce collateral asset whitelisting
        let whitelisted: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::WhitelistedTokens)
            .unwrap_or(Vec::new(&env));
        let mut token_allowed = false;
        for i in 0..whitelisted.len() {
            if whitelisted.get(i).unwrap() == token {
                token_allowed = true;
                break;
            }
        }
        assert!(token_allowed, "Token is not whitelisted as collateral");

        let market = Market {
            id,
            question,
            options,
            deadline,
            resolved: false,
            winning_outcome: 0,
            token,
        };

        // Persist market metadata in persistent storage (survives ledger archival)
        env.storage().persistent().set(&DataKey::Market(id), &market);
        env.storage().persistent().set(&DataKey::TotalPool(id), &0i128);
        env.storage()
            .persistent()
            .set(&DataKey::Bets(id), &Map::<Address, (u32, i128)>::new(&env));
    }

    /// Place a bet on an option — transfers tokens into the contract.
    /// Rejects bets if the market's token is not in the WhitelistedTokens set.
    pub fn place_bet(env: Env, market_id: u64, option_index: u32, bettor: Address, amount: i128) {
        bettor.require_auth();
        assert!(amount > 0, "Amount must be positive");

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        // Collateral asset whitelist check — prevents spam-token bets
        let whitelisted: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::WhitelistedTokens)
            .unwrap_or(Vec::new(&env));
        let mut token_allowed = false;
        for i in 0..whitelisted.len() {
            if whitelisted.get(i).unwrap() == market.token {
                token_allowed = true;
                break;
            }
        }
        assert!(
            token_allowed,
            "Token is not whitelisted — bet rejected"
        );

        assert!(!market.resolved, "Market already resolved");
        assert!(
            env.ledger().timestamp() < market.deadline,
            "Market deadline has passed"
        );
        assert!(
            option_index < market.options.len(),
            "Invalid option index"
        );

        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&bettor, &env.current_contract_address(), &amount);

        let mut bets: Map<Address, (u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap();
        bets.set(bettor, (option_index, amount));
        env.storage().persistent().set(&DataKey::Bets(market_id), &bets);

        let pool: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalPool(market_id))
            .unwrap();
        env.storage()
            .persistent()
            .set(&DataKey::TotalPool(market_id), &(pool + amount));
    }

    /// Resolve market — only admin (oracle-triggered).
    pub fn resolve_market(env: Env, market_id: u64, winning_outcome: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(!market.resolved, "Already resolved");
        assert!(
            winning_outcome < market.options.len(),
            "Invalid outcome index"
        );

        market.resolved = true;
        market.winning_outcome = winning_outcome;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
    }

    /// Distribute rewards proportionally to winners (3% platform fee).
    pub fn distribute_rewards(env: Env, market_id: u64) {
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.resolved, "Market not resolved yet");

        let bets: Map<Address, (u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap();

        let total_pool: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalPool(market_id))
            .unwrap();

        let mut winning_stake: i128 = 0;
        for (_, (outcome, amount)) in bets.iter() {
            if outcome == market.winning_outcome {
                winning_stake += amount;
            }
        }

        if winning_stake == 0 {
            return;
        }

        let payout_pool = total_pool * 97 / 100;
        let token_client = token::Client::new(&env, &market.token);

        for (bettor, (outcome, amount)) in bets.iter() {
            if outcome == market.winning_outcome {
                let payout = (amount * payout_pool) / winning_stake;
                token_client.transfer(&env.current_contract_address(), &bettor, &payout);
            }
        }
    }

    /// Read a market's stored metadata.
    pub fn get_market(env: Env, market_id: u64) -> Market {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap()
    }

    /// Get total pool for a market.
    pub fn get_pool(env: Env, market_id: u64) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalPool(market_id))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env, String};

    /// Helper: set up an initialized contract and return (client, admin).
    fn setup(env: &Env) -> (PredictionMarketClient, Address) {
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (client, admin)
    }

    // ─── Existing tests (retained) ────────────────────────────────────

    #[test]
    fn test_initialize_and_create_market() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let token = Address::generate(&env);

        // Whitelist the token first
        client.add_whitelisted_token(&token);

        let question = String::from_str(&env, "Will BTC exceed $100k by end of 2025?");
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        let deadline = env.ledger().timestamp() + 86400;

        client.create_market(&1u64, &question, &options, &deadline, &token);

        let market = client.get_market(&1u64);
        assert_eq!(market.id, 1u64);
        assert_eq!(
            market.question,
            String::from_str(&env, "Will BTC exceed $100k by end of 2025?")
        );
        assert_eq!(market.options.len(), 2);
        assert_eq!(market.deadline, deadline);
        assert!(!market.resolved);

        soroban_sdk::log!(
            &env,
            "Market stored: id={}, deadline={}, resolved={}",
            market.id,
            market.deadline,
            market.resolved
        );
    }

    #[test]
    #[should_panic(expected = "Contract already initialized")]
    fn test_double_initialize_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin); // should panic
    }

    // ─── Whitelist management tests ───────────────────────────────────

    #[test]
    fn test_add_whitelisted_token() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let xlm = Address::generate(&env);
        let usdc = Address::generate(&env);

        // Initially empty
        let list = client.get_whitelisted_tokens();
        assert_eq!(list.len(), 0);

        // Add two tokens
        client.add_whitelisted_token(&xlm);
        client.add_whitelisted_token(&usdc);

        let list = client.get_whitelisted_tokens();
        assert_eq!(list.len(), 2);
        assert!(client.is_token_whitelisted(&xlm));
        assert!(client.is_token_whitelisted(&usdc));

        soroban_sdk::log!(&env, "Whitelisted tokens count: {}", list.len());
    }

    #[test]
    #[should_panic(expected = "Token already whitelisted")]
    fn test_add_duplicate_token_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let token = Address::generate(&env);

        client.add_whitelisted_token(&token);
        client.add_whitelisted_token(&token); // should panic
    }

    #[test]
    fn test_remove_whitelisted_token() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let xlm = Address::generate(&env);
        let usdc = Address::generate(&env);

        client.add_whitelisted_token(&xlm);
        client.add_whitelisted_token(&usdc);
        assert_eq!(client.get_whitelisted_tokens().len(), 2);

        client.remove_whitelisted_token(&xlm);
        assert_eq!(client.get_whitelisted_tokens().len(), 1);
        assert!(!client.is_token_whitelisted(&xlm));
        assert!(client.is_token_whitelisted(&usdc));
    }

    #[test]
    #[should_panic(expected = "Token not found in whitelist")]
    fn test_remove_nonexistent_token_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let token = Address::generate(&env);

        client.remove_whitelisted_token(&token); // should panic
    }

    #[test]
    fn test_is_token_whitelisted_false_for_unknown() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let spam_token = Address::generate(&env);

        assert!(!client.is_token_whitelisted(&spam_token));
    }

    // ─── Create-market whitelist enforcement ──────────────────────────

    #[test]
    #[should_panic(expected = "Token is not whitelisted as collateral")]
    fn test_create_market_with_non_whitelisted_token_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let spam_token = Address::generate(&env);

        let question = String::from_str(&env, "Test market");
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        let deadline = env.ledger().timestamp() + 86400;

        // Attempt to create a market with a non-whitelisted token
        client.create_market(&1u64, &question, &options, &deadline, &spam_token);
    }

    // ─── Place-bet whitelist enforcement ──────────────────────────────

    #[test]
    #[should_panic(expected = "Token is not whitelisted")]
    fn test_place_bet_with_delisted_token_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let token = Address::generate(&env);
        let bettor = Address::generate(&env);

        // Whitelist, create market, then remove the token
        client.add_whitelisted_token(&token);

        let question = String::from_str(&env, "Test market");
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        let deadline = env.ledger().timestamp() + 86400;
        client.create_market(&1u64, &question, &options, &deadline, &token);

        // De-list the token after market creation
        client.remove_whitelisted_token(&token);

        // Visual validation — the contract should reject this bet
        soroban_sdk::log!(
            &env,
            "Attempting bet with de-listed token — expecting rejection"
        );

        // This should panic because the token was removed from the whitelist
        client.place_bet(&1u64, &0u32, &bettor, &100i128);
    }

    // ─── Whitelist with multiple tokens ───────────────────────────────

    #[test]
    fn test_whitelist_multiple_tokens_and_check() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let xlm = Address::generate(&env);
        let usdc = Address::generate(&env);
        let arst = Address::generate(&env);
        let spam = Address::generate(&env);

        client.add_whitelisted_token(&xlm);
        client.add_whitelisted_token(&usdc);
        client.add_whitelisted_token(&arst);

        assert!(client.is_token_whitelisted(&xlm));
        assert!(client.is_token_whitelisted(&usdc));
        assert!(client.is_token_whitelisted(&arst));
        assert!(!client.is_token_whitelisted(&spam));

        assert_eq!(client.get_whitelisted_tokens().len(), 3);

        soroban_sdk::log!(
            &env,
            "Whitelisted: XLM={}, USDC={}, ARST={}, SPAM={}",
            client.is_token_whitelisted(&xlm),
            client.is_token_whitelisted(&usdc),
            client.is_token_whitelisted(&arst),
            client.is_token_whitelisted(&spam)
        );
    }

    // ─── Initialize sets empty whitelist ──────────────────────────────

    #[test]
    fn test_initialize_creates_empty_whitelist() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);

        let tokens = client.get_whitelisted_tokens();
        assert_eq!(tokens.len(), 0);
    }

    // ─── Remove middle token preserves others ─────────────────────────

    #[test]
    fn test_remove_middle_token_preserves_order() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin) = setup(&env);
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        let c = Address::generate(&env);

        client.add_whitelisted_token(&a);
        client.add_whitelisted_token(&b);
        client.add_whitelisted_token(&c);

        client.remove_whitelisted_token(&b);

        let list = client.get_whitelisted_tokens();
        assert_eq!(list.len(), 2);
        assert!(client.is_token_whitelisted(&a));
        assert!(!client.is_token_whitelisted(&b));
        assert!(client.is_token_whitelisted(&c));
    }
}
