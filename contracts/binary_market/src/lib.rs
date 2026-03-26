#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, String, Vec};

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Market(u64),  // Market struct — persistent
    Bets(u64),    // Vec<(Address, u32, i128)> — persistent
    TotalPool(u64), // i128 — persistent
}

// ── Types ─────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Market {
    pub id: u64,
    pub question: String,
    /// 2–5 outcome labels (e.g. ["Yes", "No"])
    pub outcomes: Vec<String>,
    /// Unix timestamp after which no new bets are accepted
    pub end_date: u64,
    pub resolved: bool,
    pub winning_outcome: u32,
    pub token: Address,
}

#[contract]
pub struct BinaryMarket;

#[contractimpl]
impl BinaryMarket {
    // ── Admin init ────────────────────────────────────────────────────────────

    /// One-time initialisation — stores the admin address.
    pub fn initialize(env: Env, admin: Address) {
        // Prevent re-initialisation
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "Already initialized"
        );
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    // ── Market lifecycle ──────────────────────────────────────────────────────

    /// Create a new prediction market.
    ///
    /// Validates:
    /// - `end_date` is strictly in the future
    /// - `outcomes` has 2–5 entries
    /// - market `id` is not already taken
    pub fn create_market(
        env: Env,
        id: u64,
        question: String,
        outcomes: Vec<String>,
        end_date: u64,
        token: Address,
    ) {
        // Only admin may create markets
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        // end_date must be in the future
        assert!(
            end_date > env.ledger().timestamp(),
            "end_date must be in the future"
        );
        // 2–5 outcomes required
        assert!(
            outcomes.len() >= 2 && outcomes.len() <= 5,
            "outcomes must be 2-5"
        );
        // No duplicate market ids
        assert!(
            !env.storage().persistent().has(&DataKey::Market(id)),
            "market already exists"
        );

        // Store market metadata
        let market = Market {
            id,
            question,
            outcomes,
            end_date,
            resolved: false,
            winning_outcome: 0,
            token,
        };
        env.storage().persistent().set(&DataKey::Market(id), &market);

        // Initialise empty bets vec and zero pool
        env.storage()
            .persistent()
            .set(&DataKey::Bets(id), &Vec::<(Address, u32, i128)>::new(&env));
        env.storage().persistent().set(&DataKey::TotalPool(id), &0i128);
    }

    /// Place a bet on `outcome_index` for `market_id`.
    ///
    /// Locks `amount` tokens from `bettor` into the contract via `token::transfer`.
    /// Validates:
    /// - market exists and is not yet resolved
    /// - current time is before `end_date`
    /// - `outcome_index` is valid
    /// - `amount` is positive
    pub fn place_bet(
        env: Env,
        market_id: u64,
        outcome_index: u32,
        bettor: Address,
        amount: i128,
    ) {
        bettor.require_auth();

        assert!(amount > 0, "amount must be positive");

        // Load market — panics if not found
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .expect("market not found");

        assert!(!market.resolved, "market already resolved");
        assert!(
            env.ledger().timestamp() < market.end_date,
            "market has ended"
        );
        assert!(
            outcome_index < market.outcomes.len(),
            "invalid outcome index"
        );

        // Lock funds: transfer from bettor → contract
        token::Client::new(&env, &market.token).transfer(
            &bettor,
            &env.current_contract_address(),
            &amount,
        );

        // Append bet to persistent vec
        let mut bets: Vec<(Address, u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap();
        bets.push_back((bettor, outcome_index, amount));
        env.storage().persistent().set(&DataKey::Bets(market_id), &bets);

        // Accumulate total pool
        let pool: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalPool(market_id))
            .unwrap();
        env.storage()
            .persistent()
            .set(&DataKey::TotalPool(market_id), &(pool + amount));
    }

    /// Resolve the market by setting the winning outcome.
    ///
    /// Admin-only. Can only be called once (market.resolved must be false).
    pub fn resolve_market(env: Env, market_id: u64, winning_outcome: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .expect("market not found");

        assert!(!market.resolved, "market already resolved");
        assert!(
            winning_outcome < market.outcomes.len(),
            "invalid outcome index"
        );

        // Mark resolved and record winning outcome
        market.resolved = true;
        market.winning_outcome = winning_outcome;
        env.storage().persistent().set(&DataKey::Market(market_id), &market);
    }

    /// Distribute rewards proportionally to all winners.
    ///
    /// Each winner receives:
    ///   payout = (bet_amount * total_pool * 97 / 100) / winning_stake
    ///
    /// The 3% platform fee stays in the contract.
    /// Must be called after `resolve_market`.
    pub fn distribute_rewards(env: Env, market_id: u64) {
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .expect("market not found");

        assert!(market.resolved, "market not resolved");

        let bets: Vec<(Address, u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap();

        let total_pool: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalPool(market_id))
            .unwrap();

        // Calculate total stake on the winning side
        let mut winning_stake: i128 = 0;
        for i in 0..bets.len() {
            let (_, outcome, amount) = bets.get(i).unwrap();
            if outcome == market.winning_outcome {
                winning_stake += amount;
            }
        }

        // No winners — nothing to distribute
        if winning_stake == 0 {
            return;
        }

        // 97% of pool is paid out; 3% stays as platform fee
        let payout_pool = total_pool * 97 / 100;

        let token_client = token::Client::new(&env, &market.token);

        // Pay each winner their proportional share
        for i in 0..bets.len() {
            let (bettor, outcome, amount) = bets.get(i).unwrap();
            if outcome == market.winning_outcome {
                // payout = bet_amount * payout_pool / winning_stake
                let payout = (amount * payout_pool) / winning_stake;
                token_client.transfer(&env.current_contract_address(), &bettor, &payout);
            }
        }
    }

    // ── Read helpers ──────────────────────────────────────────────────────────

    pub fn get_market(env: Env, market_id: u64) -> Market {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .expect("market not found")
    }

    pub fn get_total_pool(env: Env, market_id: u64) -> i128 {
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

    // ── helpers ───────────────────────────────────────────────────────────────

    /// Register a SAC token and mint `amount` to each recipient.
    fn make_token(env: &Env, recipients: &[(&Address, i128)]) -> Address {
        let issuer = Address::generate(env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        let sac_client = token::StellarAssetClient::new(env, &sac.address());
        for (addr, amt) in recipients {
            sac_client.mint(addr, amt);
        }
        sac.address()
    }

    /// Spin up a contract, initialise it, and create market #1 with a real token.
    /// Returns (env, client, admin, bettor_a, bettor_b, token_address, deadline).
    fn setup() -> (
        Env,
        BinaryMarketClient<'static>,
        Address,
        Address,
        Address,
        Address,
        u64,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, BinaryMarket);
        let client = BinaryMarketClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let bettor_a = Address::generate(&env);
        let bettor_b = Address::generate(&env);

        let token = make_token(&env, &[(&bettor_a, 1_000), (&bettor_b, 1_000)]);

        client.initialize(&admin);

        let deadline = env.ledger().timestamp() + 86_400;
        client.create_market(
            &1u64,
            &String::from_str(&env, "Will BTC hit $100k?"),
            &vec![
                &env,
                String::from_str(&env, "Yes"),
                String::from_str(&env, "No"),
            ],
            &deadline,
            &token,
        );

        (env, client, admin, bettor_a, bettor_b, token, deadline)
    }

    // ── initialize ────────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_sets_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BinaryMarket);
        let client = BinaryMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin); // must not panic
    }

    #[test]
    #[should_panic(expected = "Already initialized")]
    fn test_double_initialize_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BinaryMarket);
        let client = BinaryMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin); // second call must panic
    }

    // ── create_market ─────────────────────────────────────────────────────────

    #[test]
    fn test_create_market_stores_metadata() {
        let (_, client, _, _, _, _, deadline) = setup();
        let m = client.get_market(&1u64);
        assert_eq!(m.id, 1u64);
        assert_eq!(m.outcomes.len(), 2);
        assert_eq!(m.end_date, deadline);
        assert!(!m.resolved);
        assert_eq!(client.get_total_pool(&1u64), 0);
    }

    #[test]
    #[should_panic(expected = "end_date must be in the future")]
    fn test_create_market_past_end_date_panics() {
        let (env, client, _, _, _, token, _) = setup();
        client.create_market(
            &2u64,
            &String::from_str(&env, "Past market"),
            &vec![
                &env,
                String::from_str(&env, "Yes"),
                String::from_str(&env, "No"),
            ],
            &0u64, // past
            &token,
        );
    }

    #[test]
    #[should_panic(expected = "outcomes must be 2-5")]
    fn test_create_market_one_outcome_panics() {
        let (env, client, _, _, _, token, _) = setup();
        client.create_market(
            &2u64,
            &String::from_str(&env, "Bad"),
            &vec![&env, String::from_str(&env, "Only")],
            &(env.ledger().timestamp() + 100),
            &token,
        );
    }

    #[test]
    #[should_panic(expected = "outcomes must be 2-5")]
    fn test_create_market_six_outcomes_panics() {
        let (env, client, _, _, _, token, _) = setup();
        client.create_market(
            &2u64,
            &String::from_str(&env, "Too many"),
            &vec![
                &env,
                String::from_str(&env, "A"),
                String::from_str(&env, "B"),
                String::from_str(&env, "C"),
                String::from_str(&env, "D"),
                String::from_str(&env, "E"),
                String::from_str(&env, "F"),
            ],
            &(env.ledger().timestamp() + 100),
            &token,
        );
    }

    #[test]
    #[should_panic(expected = "market already exists")]
    fn test_create_duplicate_market_panics() {
        let (env, client, _, _, _, token, deadline) = setup();
        client.create_market(
            &1u64, // duplicate id
            &String::from_str(&env, "Dup"),
            &vec![
                &env,
                String::from_str(&env, "Yes"),
                String::from_str(&env, "No"),
            ],
            &deadline,
            &token,
        );
    }

    #[test]
    fn test_create_market_five_outcomes_ok() {
        let (env, client, _, _, _, token, _) = setup();
        client.create_market(
            &2u64,
            &String::from_str(&env, "Multi"),
            &vec![
                &env,
                String::from_str(&env, "A"),
                String::from_str(&env, "B"),
                String::from_str(&env, "C"),
                String::from_str(&env, "D"),
                String::from_str(&env, "E"),
            ],
            &(env.ledger().timestamp() + 100),
            &token,
        );
        assert_eq!(client.get_market(&2u64).outcomes.len(), 5);
    }

    // ── place_bet ─────────────────────────────────────────────────────────────

    #[test]
    fn test_place_bet_locks_funds_and_updates_pool() {
        let (_, client, _, bettor_a, _, _, _) = setup();
        client.place_bet(&1u64, &0u32, &bettor_a, &300);
        assert_eq!(client.get_total_pool(&1u64), 300);
    }

    #[test]
    fn test_place_bet_multiple_bettors_accumulates_pool() {
        let (_, client, _, bettor_a, bettor_b, _, _) = setup();
        client.place_bet(&1u64, &0u32, &bettor_a, &400);
        client.place_bet(&1u64, &1u32, &bettor_b, &600);
        assert_eq!(client.get_total_pool(&1u64), 1_000);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_place_bet_zero_amount_panics() {
        let (_, client, _, bettor_a, _, _, _) = setup();
        client.place_bet(&1u64, &0u32, &bettor_a, &0);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_place_bet_negative_amount_panics() {
        let (_, client, _, bettor_a, _, _, _) = setup();
        client.place_bet(&1u64, &0u32, &bettor_a, &-1);
    }

    #[test]
    #[should_panic(expected = "invalid outcome index")]
    fn test_place_bet_invalid_outcome_panics() {
        let (_, client, _, bettor_a, _, _, _) = setup();
        client.place_bet(&1u64, &99u32, &bettor_a, &100);
    }

    #[test]
    #[should_panic(expected = "market has ended")]
    fn test_place_bet_after_end_date_panics() {
        let (env, client, _, bettor_a, _, _, _) = setup();
        // Advance ledger past deadline
        env.ledger().with_mut(|l| l.timestamp += 86_401);
        client.place_bet(&1u64, &0u32, &bettor_a, &100);
    }

    #[test]
    #[should_panic(expected = "market already resolved")]
    fn test_place_bet_on_resolved_market_panics() {
        let (_, client, _, bettor_a, _, _, _) = setup();
        client.resolve_market(&1u64, &0u32);
        client.place_bet(&1u64, &0u32, &bettor_a, &100);
    }

    // ── resolve_market ────────────────────────────────────────────────────────

    #[test]
    fn test_resolve_market_sets_resolved_flag() {
        let (_, client, _, _, _, _, _) = setup();
        client.resolve_market(&1u64, &1u32);
        let m = client.get_market(&1u64);
        assert!(m.resolved);
        assert_eq!(m.winning_outcome, 1u32);
    }

    #[test]
    #[should_panic(expected = "market already resolved")]
    fn test_resolve_market_twice_panics() {
        let (_, client, _, _, _, _, _) = setup();
        client.resolve_market(&1u64, &0u32);
        client.resolve_market(&1u64, &0u32);
    }

    #[test]
    #[should_panic(expected = "invalid outcome index")]
    fn test_resolve_market_invalid_outcome_panics() {
        let (_, client, _, _, _, _, _) = setup();
        client.resolve_market(&1u64, &99u32);
    }

    // ── distribute_rewards ────────────────────────────────────────────────────

    #[test]
    fn test_distribute_rewards_pays_winners_proportionally() {
        let (_, client, _, bettor_a, bettor_b, token, _) = setup();

        // bettor_a bets 600 on Yes (outcome 0), bettor_b bets 400 on No (outcome 1)
        client.place_bet(&1u64, &0u32, &bettor_a, &600);
        client.place_bet(&1u64, &1u32, &bettor_b, &400);

        // Resolve: Yes wins
        client.resolve_market(&1u64, &0u32);
        client.distribute_rewards(&1u64);

        // total_pool = 1000, payout_pool = 970 (97%), winning_stake = 600
        // bettor_a payout = 600 * 970 / 600 = 970
        let token_client = token::Client::new(&env, &token);
        // bettor_a started with 1000, bet 600, should receive 970 → balance = 1000 - 600 + 970 = 1370
        assert_eq!(token_client.balance(&bettor_a), 1_370);
        // bettor_b lost their 400 → balance = 1000 - 400 = 600
        assert_eq!(token_client.balance(&bettor_b), 600);    }

    #[test]
    fn test_distribute_rewards_multiple_winners_proportional() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BinaryMarket);
        let client = BinaryMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        let w1 = Address::generate(&env);
        let w2 = Address::generate(&env);
        let loser = Address::generate(&env);
        let token = make_token(&env, &[(&w1, 1_000), (&w2, 1_000), (&loser, 1_000)]);

        client.initialize(&admin);
        client.create_market(
            &1u64,
            &String::from_str(&env, "Q"),
            &vec![
                &env,
                String::from_str(&env, "Yes"),
                String::from_str(&env, "No"),
            ],
            &(env.ledger().timestamp() + 100),
            &token,
        );

        // w1 bets 300 on Yes, w2 bets 300 on Yes, loser bets 400 on No
        client.place_bet(&1u64, &0u32, &w1, &300);
        client.place_bet(&1u64, &0u32, &w2, &300);
        client.place_bet(&1u64, &1u32, &loser, &400);

        client.resolve_market(&1u64, &0u32);
        client.distribute_rewards(&1u64);

        // total_pool=1000, payout_pool=970, winning_stake=600
        // w1 payout = 300 * 970 / 600 = 485
        // w2 payout = 300 * 970 / 600 = 485
        let tc = token::Client::new(&env, &token);
        assert_eq!(tc.balance(&w1), 1_000 - 300 + 485);   // 1185
        assert_eq!(tc.balance(&w2), 1_000 - 300 + 485);   // 1185
        assert_eq!(tc.balance(&loser), 1_000 - 400);       // 600
    }

    #[test]
    fn test_distribute_rewards_no_winners_is_noop() {
        let (_, client, _, bettor_a, _, _, _) = setup();
        // bettor_a bets on outcome 1, but outcome 0 wins
        client.place_bet(&1u64, &1u32, &bettor_a, &500);
        client.resolve_market(&1u64, &0u32); // outcome 0 wins, no bets on it
        client.distribute_rewards(&1u64); // must not panic
    }

    #[test]
    #[should_panic(expected = "market not resolved")]
    fn test_distribute_before_resolve_panics() {
        let (_, client, _, bettor_a, _, _, _) = setup();
        client.place_bet(&1u64, &0u32, &bettor_a, &100);
        client.distribute_rewards(&1u64);
    }

    #[test]
    fn test_platform_fee_stays_in_contract() {
        let (env, client, _, bettor_a, bettor_b, token, _) = setup();

        // Equal bets on both sides: 500 each → pool = 1000
        client.place_bet(&1u64, &0u32, &bettor_a, &500);
        client.place_bet(&1u64, &1u32, &bettor_b, &500);

        client.resolve_market(&1u64, &0u32);
        client.distribute_rewards(&1u64);

        // payout_pool = 970, bettor_a wins all 970
        // 30 tokens (3%) remain in contract
        let tc = token::Client::new(&env, &token);
        // bettor_a: started 1000, bet 500, won 970 → 1470
        assert_eq!(tc.balance(&bettor_a), 1_470);
        // bettor_b: started 1000, bet 500, lost → 500
        assert_eq!(tc.balance(&bettor_b), 500);
        // contract holds the 3% fee: 1000 - 970 = 30
        assert_eq!(tc.balance(&client.address), 30);
    }
}
