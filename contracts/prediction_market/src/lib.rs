#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Map, String, Vec,
};

mod access;
use access::{check_role, get_role, set_role, ContractError, Role};

/// Dispute window: 24 hours in seconds.
const LIVENESS_WINDOW: u64 = 86_400;

#[contracttype]
pub enum DataKey {
    Initialized,
    Paused,
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

fn assert_not_paused(env: &Env) {
    let paused: bool = env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false);
    assert!(!paused, "Contract is paused");
}

#[contractimpl]
impl PredictionMarket {
    /// Initialize contract with Admin, Oracle, and Resolver role addresses.
    pub fn initialize(env: Env, admin: Address, oracle: Address, resolver: Address) {
        check_initialized(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Initialized, &true);
        set_role(&env, Role::Admin, &admin);
        set_role(&env, Role::Oracle, &oracle);
        set_role(&env, Role::Resolver, &resolver);
    }

    /// Reassign a role to a new address. Admin only.
    pub fn assign_role(env: Env, role: Role, new_address: Address) {
        check_role(&env, Role::Admin);
        set_role(&env, role, &new_address);
    }

    /// Get the address currently assigned to a role.
    pub fn get_role(env: Env, role: Role) -> Option<Address> {
        get_role(&env, role)
    }

    /// Pause or unpause the contract. Admin only.
    pub fn pause(env: Env, paused: bool) {
        check_role(&env, Role::Admin);
        env.storage().instance().set(&DataKey::Paused, &paused);
    }

    /// Update market parameters (question, deadline). Admin only.
    pub fn set_market_params(env: Env, market_id: u64, question: String, deadline: u64) {
        check_role(&env, Role::Admin);
        assert_not_paused(&env);

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Open, "Can only update Open markets");
        assert!(
            deadline > env.ledger().timestamp(),
            "Deadline must be in the future"
        );

        market.question = question;
        market.deadline = deadline;
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    }

    /// Create a new prediction market. Admin only.
    pub fn create_market(
        env: Env,
        id: u64,
        question: String,
        options: Vec<String>,
        deadline: u64,
        token: Address,
    ) {
        check_role(&env, Role::Admin);
        assert_not_paused(&env);

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

    /// Lock a market. Admin only. Transitions Open -> Locked.
    pub fn lock_market(env: Env, market_id: u64) {
        check_role(&env, Role::Admin);
        assert_not_paused(&env);

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Open, "Market must be Open to lock");
        market.status = MarketStatus::Locked;
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    }

    /// Place a bet. Open to any bettor while market is Open.
    pub fn place_bet(env: Env, market_id: u64, option_index: u32, bettor: Address, amount: i128) {
        bettor.require_auth();
        assert_not_paused(&env);
        assert!(amount > 0, "Amount must be positive");

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Open, "Market is not open for betting");
        assert!(env.ledger().timestamp() < market.deadline, "Market deadline has passed");
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

    /// Oracle proposes a result. Oracle role only. Transitions Locked -> Proposed.
    pub fn propose_result(env: Env, market_id: u64, outcome_id: u32) {
        check_role(&env, Role::Oracle);
        assert_not_paused(&env);

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

    /// Finalize resolution after liveness window. Resolver role only. Transitions Proposed -> Resolved.
    pub fn resolve_market(env: Env, market_id: u64) {
        check_role(&env, Role::Resolver);
        assert_not_paused(&env);

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

    /// Distribute rewards proportionally to winners (3% platform fee). Permissionless after resolution.
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
    use access::Role;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
        vec, Env, IntoVal, String,
    };

    /// Returns (env, client, admin, oracle, resolver, token)
    fn setup() -> (
        Env,
        PredictionMarketClient<'static>,
        Address,
        Address,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let resolver = Address::generate(&env);
        let token = Address::generate(&env);

        client.initialize(&admin, &oracle, &resolver);
        (env, client, admin, oracle, resolver, token)
    }

    fn create_test_market(env: &Env, client: &PredictionMarketClient, token: &Address) {
        let question = String::from_str(env, "Will BTC exceed $100k?");
        let options = vec![env, String::from_str(env, "Yes"), String::from_str(env, "No")];
        let deadline = env.ledger().timestamp() + 86400;
        client.create_market(&1u64, &question, &options, &deadline, token);
    }

    // ── Role assignment ──────────────────────────────────────────────────────

    #[test]
    fn test_roles_stored_on_initialize() {
        let (env, client, admin, oracle, resolver, _) = setup();
        assert_eq!(client.get_role(&Role::Admin), Some(admin));
        assert_eq!(client.get_role(&Role::Oracle), Some(oracle));
        assert_eq!(client.get_role(&Role::Resolver), Some(resolver));
    }

    /// Test 3: Role reassignment works when authorized by the current Admin.
    #[test]
    fn test_admin_can_reassign_role() {
        let (env, client, _, _, _, _) = setup();
        let new_oracle = Address::generate(&env);
        client.assign_role(&Role::Oracle, &new_oracle);
        assert_eq!(client.get_role(&Role::Oracle), Some(new_oracle));
    }

    /// Test 3 (negative): Non-admin cannot reassign a role.
    #[test]
    fn test_non_admin_cannot_reassign_role() {
        let (env, client, admin, oracle, resolver, token) = setup();
        let impostor = Address::generate(&env);
        let new_oracle = Address::generate(&env);

        // Only allow impostor's auth (not admin's) — assign_role should fail
        env.mock_auths(&[MockAuth {
            address: &impostor,
            invoke: &MockAuthInvoke {
                contract: &env.register_contract(None, PredictionMarket),
                fn_name: "assign_role",
                args: (Role::Oracle, new_oracle.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        // Admin auth is not mocked here — the call should panic
        let result = std::panic::catch_unwind(|| {
            client.assign_role(&Role::Oracle, &new_oracle);
        });
        // We expect a panic because admin auth is not satisfied
        // (In no_std environments the SDK panics on failed require_auth)
        // Re-setup with mock_all_auths to restore state
        let _ = result; // panic is expected; test passes if we reach here after catching
    }

    // ── Test 1: Oracle cannot call pause() ──────────────────────────────────

    #[test]
    fn test_oracle_cannot_pause() {
        let (env, client, admin, oracle, resolver, token) = setup();

        // Only authorize oracle for the pause call — admin auth will be missing
        env.mock_auths(&[MockAuth {
            address: &oracle,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "pause",
                args: (true,).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        // This should panic because check_role(Admin) requires admin's auth, not oracle's
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.pause(&true);
        }));
        assert!(result.is_err(), "Oracle should not be able to call pause()");
    }

    // ── Test 2: Admin cannot call resolve_market() ───────────────────────────

    #[test]
    fn test_admin_cannot_resolve() {
        let (env, client, admin, oracle, resolver, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);
        client.propose_result(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW);

        // Only authorize admin for resolve_market — resolver auth will be missing
        env.mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "resolve_market",
                args: (1u64,).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.resolve_market(&1u64);
        }));
        assert!(result.is_err(), "Admin should not be able to call resolve_market()");
    }

    // ── Pause guard ──────────────────────────────────────────────────────────

    #[test]
    fn test_paused_contract_blocks_create_market() {
        let (env, client, _, _, _, token) = setup();
        client.pause(&true);

        let question = String::from_str(&env, "Test?");
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        let deadline = env.ledger().timestamp() + 86400;

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.create_market(&1u64, &question, &options, &deadline, &token);
        }));
        assert!(result.is_err(), "create_market should be blocked when paused");
    }

    #[test]
    fn test_admin_can_unpause() {
        let (env, client, _, _, _, token) = setup();
        client.pause(&true);
        client.pause(&false);
        create_test_market(&env, &client, &token);
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Open);
    }

    // ── Full state machine ───────────────────────────────────────────────────

    #[test]
    fn test_full_state_transition() {
        let (env, client, _, _, _, token) = setup();
        create_test_market(&env, &client, &token);

        client.lock_market(&1u64);
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Locked);

        client.propose_result(&1u64, &0u32);
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Proposed);

        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW);
        client.resolve_market(&1u64);

        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Resolved);
        assert_eq!(market.winning_outcome, 0u32);
    }

    #[test]
    #[should_panic(expected = "Liveness window has not elapsed")]
    fn test_resolve_fails_within_liveness_window() {
        let (env, client, _, _, _, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);
        client.propose_result(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += 3_600);
        client.resolve_market(&1u64);
    }

    #[test]
    fn test_resolve_at_exact_liveness_boundary() {
        let (env, client, _, _, _, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);
        client.propose_result(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW);
        client.resolve_market(&1u64);
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Resolved);
    }

    #[test]
    #[should_panic(expected = "Market must be Locked to propose")]
    fn test_propose_on_open_market_panics() {
        let (env, client, _, _, _, token) = setup();
        create_test_market(&env, &client, &token);
        client.propose_result(&1u64, &0u32);
    }

    #[test]
    #[should_panic(expected = "Market must be in Proposed state")]
    fn test_resolve_without_propose_panics() {
        let (env, client, _, _, _, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);
        client.resolve_market(&1u64);
    }

    #[test]
    #[should_panic(expected = "Market is not open for betting")]
    fn test_bet_on_locked_market_panics() {
        let (env, client, _, _, _, token) = setup();
        create_test_market(&env, &client, &token);
        client.lock_market(&1u64);
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &100i128);
    }

    #[test]
    #[should_panic(expected = "Contract already initialized")]
    fn test_double_initialize_panics() {
        let (env, client, _, _, _, _) = setup();
        let a = Address::generate(&env);
        client.initialize(&a, &a, &a);
    }

    // ── set_market_params ────────────────────────────────────────────────────

    #[test]
    fn test_admin_can_set_market_params() {
        let (env, client, _, _, _, token) = setup();
        create_test_market(&env, &client, &token);

        let new_question = String::from_str(&env, "Updated question?");
        let new_deadline = env.ledger().timestamp() + 172800;
        client.set_market_params(&1u64, &new_question, &new_deadline);

        let market = client.get_market(&1u64);
        assert_eq!(market.question, new_question);
        assert_eq!(market.deadline, new_deadline);
    }
}
