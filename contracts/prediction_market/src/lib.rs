#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Map, String, Vec,
};

/// Dispute window: 24 hours in seconds. resolve_market cannot be called before this elapses.
const LIVENESS_WINDOW: u64 = 86_400;

#[contracttype]
pub enum DataKey {
    Initialized,
    Admin,
    OracleAddress,
    Market(u64),
    Bets(u64),
    TotalPool(u64),
}

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum MarketStatus {
    Open,
    Locked,
    Proposed,
    Resolved,
}

#[contracttype]
#[derive(Clone)]
pub struct Market {
    pub id: u64,
    pub question: String,
    pub options: Vec<String>,
    pub deadline: u64,
    pub status: MarketStatus,
    pub winning_outcome: u32,
    pub token: Address,
    pub proposed_outcome: Option<u32>,
    pub proposal_timestamp: u64,
}

#[contract]
pub struct PredictionMarket;

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
    /// Initialize contract with admin and oracle addresses.
    pub fn initialize(env: Env, admin: Address, oracle: Address) {
        check_initialized(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::OracleAddress, &oracle);
    }

    /// Create a new prediction market (status: Open).
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

        let market = Market {
            id,
            question,
            options,
            deadline,
            status: MarketStatus::Open,
            winning_outcome: 0,
            token,
            proposed_outcome: None,
            proposal_timestamp: 0,
        };

        env.storage().persistent().set(&DataKey::Market(id), &market);
        env.storage().persistent().set(&DataKey::TotalPool(id), &0i128);
        env.storage()
            .persistent()
            .set(&DataKey::Bets(id), &Map::<Address, (u32, i128)>::new(&env));
    }

    /// Lock a market (admin only). Transitions Open -> Locked.
    pub fn lock_market(env: Env, market_id: u64) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Open, "Market must be Open to lock");
        market.status = MarketStatus::Locked;
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    }

    /// Place a bet on an option — only allowed while market is Open.
    pub fn place_bet(env: Env, market_id: u64, option_index: u32, bettor: Address, amount: i128) {
        bettor.require_auth();
        assert!(amount > 0, "Amount must be positive");

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Open, "Market is not open for betting");
        assert!(
            env.ledger().timestamp() < market.deadline,
            "Market deadline has passed"
        );
        assert!(option_index < market.options.len(), "Invalid option index");

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

    /// Oracle proposes a result. Transitions Locked -> Proposed.
    /// Starts the 24-hour liveness/dispute window.
    pub fn propose_result(env: Env, oracle: Address, market_id: u64, outcome_id: u32) {
        oracle.require_auth();

        let stored_oracle: Address = env
            .storage()
            .instance()
            .get(&DataKey::OracleAddress)
            .unwrap();
        assert!(oracle == stored_oracle, "Caller is not the registered oracle");

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Locked, "Market must be Locked to propose");
        assert!(outcome_id < market.options.len(), "Invalid outcome index");

        market.status = MarketStatus::Proposed;
        market.proposed_outcome = Some(outcome_id);
        market.proposal_timestamp = env.ledger().timestamp();
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    }

    /// Finalize resolution after the liveness window. Transitions Proposed -> Resolved.
    pub fn resolve_market(env: Env, market_id: u64) {
        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Proposed, "Market must be in Proposed state");
        assert!(
            env.ledger().timestamp() >= market.proposal_timestamp + LIVENESS_WINDOW,
            "Liveness window has not elapsed"
        );

        market.winning_outcome = market.proposed_outcome.unwrap();
        market.status = MarketStatus::Resolved;
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    }

    /// Distribute rewards proportionally to winners (3% platform fee).
    pub fn distribute_rewards(env: Env, market_id: u64) {
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.status == MarketStatus::Resolved, "Market not resolved yet");

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

    pub fn get_market(env: Env, market_id: u64) -> Market {
        env.storage().persistent().get(&DataKey::Market(market_id)).unwrap()
    }

    pub fn get_pool(env: Env, market_id: u64) -> i128 {
        env.storage().persistent().get(&DataKey::TotalPool(market_id)).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, vec, Env, String};

    fn setup() -> (Env, PredictionMarketClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let token = Address::generate(&env);

        client.initialize(&admin, &oracle);
        (env, client, admin, oracle, token)
    }

    fn create_test_market(env: &Env, client: &PredictionMarketClient, token: &Address) {
        let question = String::from_str(env, "Will BTC exceed $100k?");
        let options = vec![env, String::from_str(env, "Yes"), String::from_str(env, "No")];
        let deadline = env.ledger().timestamp() + 86400;
        client.create_market(&1u64, &question, &options, &deadline, token);
    }

    #[test]
    fn test_initialize_and_create_market() {
        let (env, client, _, _, token) = setup();
        create_test_market(&env, &client, &token);

        let market = client.get_market(&1u64);
        assert_eq!(market.id, 1u64);
        assert_eq!(market.status, MarketStatus::Open);
        assert!(market.proposed_outcome.is_none());
        assert_eq!(market.proposal_timestamp, 0);
    }

    #[test]
    #[should_panic(expected = "Contract already initialized")]
    fn test_double_initialize_panics() {
        let (env, client, _, _, _) = setup();
        let admin2 = Address::generate(&env);
        let oracle2 = Address::generate(&env);
        client.initialize(&admin2, &oracle2);
    }

    // Test 1: Non-oracle address cannot propose a result.
    #[test]
    #[should_panic(expected = "Caller is not the registered oracle")]
    fn test_non_oracle_cannot_propose() {
        let (env, client, _, _, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);

        let impostor = Address::generate(&env);
        client.propose_result(&impostor, &1u64, &0u32);
    }

    // Test 2: resolve_market fails if called within the liveness window (1 hour after proposal).
    #[test]
    #[should_panic(expected = "Liveness window has not elapsed")]
    fn test_resolve_fails_within_liveness_window() {
        let (env, client, _, oracle, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);
        client.propose_result(&oracle, &1u64, &0u32);

        // Advance time by only 1 hour (3600s) — still within the 24h window
        env.ledger().with_mut(|l| l.timestamp += 3_600);
        client.resolve_market(&1u64);
    }

    // Test 3: resolve_market succeeds after 25 hours (outside the liveness window).
    #[test]
    fn test_resolve_succeeds_after_liveness_window() {
        let (env, client, _, oracle, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);
        client.propose_result(&oracle, &1u64, &0u32);

        // Advance time by 25 hours (90000s) — past the 24h window
        env.ledger().with_mut(|l| l.timestamp += 90_000);
        client.resolve_market(&1u64);

        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Resolved);
        assert_eq!(market.winning_outcome, 0u32);
    }

    #[test]
    fn test_full_state_transition_open_locked_proposed_resolved() {
        let (env, client, _, oracle, token) = setup();
        create_test_market(&env, &client, &token);

        assert_eq!(client.get_market(&1u64).status, MarketStatus::Open);

        client.lock_market(&1u64);
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Locked);

        client.propose_result(&oracle, &1u64, &1u32);
        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Proposed);
        assert_eq!(market.proposed_outcome, Some(1u32));
        assert!(market.proposal_timestamp > 0);

        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW);
        client.resolve_market(&1u64);
        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Resolved);
        assert_eq!(market.winning_outcome, 1u32);
    }

    #[test]
    #[should_panic(expected = "Market must be Locked to propose")]
    fn test_propose_on_open_market_panics() {
        let (env, client, _, oracle, token) = setup();
        create_test_market(&env, &client, &token);
        // Market is Open, not Locked — should panic
        client.propose_result(&oracle, &1u64, &0u32);
    }

    #[test]
    #[should_panic(expected = "Market must be in Proposed state")]
    fn test_resolve_without_propose_panics() {
        let (env, client, _, _, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);
        // Skip propose_result — should panic
        client.resolve_market(&1u64);
    }

    #[test]
    #[should_panic(expected = "Market is not open for betting")]
    fn test_bet_on_locked_market_panics() {
        let (env, client, _, _, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);

        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &100i128);
    }

    #[test]
    fn test_resolve_at_exact_liveness_boundary() {
        let (env, client, _, oracle, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);
        client.propose_result(&oracle, &1u64, &0u32);

        // Advance by exactly LIVENESS_WINDOW — boundary should succeed
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW);
        client.resolve_market(&1u64);

        assert_eq!(client.get_market(&1u64).status, MarketStatus::Resolved);
    }
}
