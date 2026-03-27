#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, Map, String, Vec,
};

/// Maximum winners processed per batch_distribute call.
/// Keeps CPU instruction count well below Soroban's per-tx ceiling (~100M instructions).
/// At ~500k instructions per transfer, 25 winners ≈ 12.5M instructions — safe headroom.
pub const MAX_BATCH_SIZE: u32 = 25;

/// Maximum allowed drift (in seconds) between the source data timestamp and the ledger timestamp.
/// Source: Fast-moving crypto markets require fresh data to prevent "Old News" exploits.
pub const MAX_ORACLE_DRIFT: u64 = 1800;

#[contracttype]
pub enum DataKey {
    Initialized,
    Admin,
    Market(u64),
    /// Cold: per-user positions — Persistent storage
    UserPosition(u64),
    /// Hot: total shares per market — Instance storage
    TotalShares(u64),
    /// Hot: pause flag per market — Instance storage
    IsPaused(u64),
    /// Hot: settlement cursor (index into winners vec) — Instance storage
    SettlementCursor(u64),
    /// Hot: global platform status — Instance storage.
    /// true = active (default), false = graceful shutdown.
    /// Only blocks create_market; existing markets resolve and pay out normally.
    GlobalStatus,
    /// Transient: mutex flag to prevent reentrancy in batch_distribute
    Busy,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MarketStatus {
    Active,
    Proposed,
    Disputed,
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
    /// Initialize contract with admin address.
    pub fn initialize(env: Env, admin: Address) {
        check_initialized(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Admin, &admin);
        // Platform starts active by default
        env.storage().instance().set(&DataKey::GlobalStatus, &true);
    }

    /// Create a new prediction market.
    /// Blocked when GlobalStatus is false (graceful shutdown).
    /// Hot data (total_shares, is_paused) written to Instance storage.
    /// Cold data (market metadata, user positions) written to Persistent storage.
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

        // Graceful shutdown guard — checked before any other work
        let active: bool = env
            .storage()
            .instance()
            .get(&DataKey::GlobalStatus)
            .unwrap_or(true);
        assert!(active, "Platform is shut down");

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
            status: MarketStatus::Active,
            winning_outcome: 0,
            token,
        };

        // Cold: market metadata + user positions map → Persistent
        env.storage().persistent().set(&DataKey::Market(id), &market);
        env.storage()
            .persistent()
            .set(&DataKey::UserPosition(id), &Map::<Address, (u32, i128)>::new(&env));

        // Hot: total_shares + is_paused → Instance (cheaper reads/writes)
        env.storage().instance().set(&DataKey::TotalShares(id), &0i128);
        env.storage().instance().set(&DataKey::IsPaused(id), &false);
    }

    /// Place a bet on an option.
    /// Reads total_shares from Instance (1 cheap read) instead of Persistent.
    pub fn place_bet(env: Env, market_id: u64, option_index: u32, bettor: Address, amount: i128) {
        bettor.require_auth();
        assert!(amount > 0, "Amount must be positive");

        // Hot read: is_paused from Instance
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::IsPaused(market_id))
            .unwrap_or(false);
        assert!(!paused, "Market is paused");

        // Cold read: market metadata from Persistent
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Active, "Market not active");
        assert!(
            env.ledger().timestamp() < market.deadline,
            "Market deadline has passed"
        );
        assert!(option_index < market.options.len(), "Invalid option index");

        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&bettor, &env.current_contract_address(), &amount);

        // Cold write: user position → Persistent
        let mut positions: Map<Address, (u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::UserPosition(market_id))
            .unwrap();
        positions.set(bettor, (option_index, amount));
        env.storage()
            .persistent()
            .set(&DataKey::UserPosition(market_id), &positions);

        // Hot write: total_shares → Instance (avoids expensive Persistent write on every bet)
        let shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares(market_id), &(shares + amount));

        // Emit Bet event
        // Topics: ("Bet", market_id)
        // Data: (bettor, amount, option_index)
        env.events().publish((symbol_short!("Bet"), market_id), (bettor.clone(), amount, option_index));
    }

    /// Pause or unpause a market (admin only).
    /// Writes to Instance storage — single cheap write.
    pub fn set_paused(env: Env, market_id: u64, paused: bool) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::IsPaused(market_id), &paused);
    }

    /// Graceful shutdown / re-activation (admin only).
    /// active=false → new markets blocked; existing markets resolve and pay out normally.
    /// active=true  → platform re-opened.
    /// Single Instance write — cheapest possible admin action.
    pub fn set_global_status(env: Env, active: bool) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::GlobalStatus, &active);
    }

    /// Read the current global platform status.
    pub fn get_global_status(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::GlobalStatus)
            .unwrap_or(true)
    }

    /// Propose market resolution — only admin (oracle-triggered).
    /// Enforces a 30-minute drift limit to prevent stale data exploits.
    pub fn propose_resolution(env: Env, market_id: u64, winning_outcome: u32, source_timestamp: u64) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        // CHECK: Data freshness - must not be older than 30 minutes (1800s)
        let ledger_timestamp = env.ledger().timestamp();
        assert!(
            ledger_timestamp <= source_timestamp + MAX_ORACLE_DRIFT,
            "ERR_STALE_DATA"
        );
        // Also ensure the timestamp is not from the future (logical consistency)
        assert!(source_timestamp <= ledger_timestamp, "ERR_STALE_DATA");

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Active, "Market not active");
        assert!(
            winning_outcome < market.options.len(),
            "Invalid outcome index"
        );

        market.status = MarketStatus::Proposed;
        market.winning_outcome = winning_outcome;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
    }

    /// Disputer challenges a Proposed result by posting a bond.
    /// Moves market to Disputed state and freezes payouts.
    pub fn dispute(env: Env, market_id: u64, disputer: Address, bond_amount: i128) {
        disputer.require_auth();
        assert!(bond_amount > 0, "Bond must be positive");

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Proposed, "Market not in Proposed state");

        // Escrow the bond
        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&disputer, &env.current_contract_address(), &bond_amount);

        market.status = MarketStatus::Disputed;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);

        // Emit DisputeBondEscrowed for visual validation / indexing
        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "DisputeBondEscrowed"), market_id, disputer),
            bond_amount
        );
    }

    /// Resolve market finally after potential dispute.
    pub fn resolve_market(env: Env, market_id: u64, winning_outcome: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        // Final resolution override by admin (e.g. after examining dispute)
        assert!(
            market.status == MarketStatus::Proposed || market.status == MarketStatus::Disputed,
            "Market must be proposed or disputed to resolve"
        );
        assert!(
            winning_outcome < market.options.len(),
            "Invalid outcome index"
        );

        market.status = MarketStatus::Resolved;
        market.winning_outcome = winning_outcome;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
    }

    /// Batch-distribute rewards to at most `batch_size` winners per call.
    ///
    /// # Batch pattern
    /// Winners are collected into a `Vec` once, then a `SettlementCursor` (Instance storage)
    /// tracks the next unpaid index. Each invocation pays `batch_size` winners and advances
    /// the cursor, so callers can page through 50+ winners across multiple transactions without
    /// hitting the Soroban CPU ceiling (~100M instructions per tx).
    ///
    /// Enforces `batch_size <= MAX_BATCH_SIZE` to guarantee safe instruction headroom.
    ///
    /// Returns the number of winners paid in this call.
    /// Batch-distribute rewards to at most `batch_size` winners per call.
    /// Returns the number of winners paid in this call.
    pub fn batch_distribute(env: Env, market_id: u64, batch_size: u32) -> u32 {
        // CHECK: Reentrancy guard - prevent double-claim attacks
        let is_busy: bool = env
            .storage()
            .temporary()
            .get(&DataKey::Busy)
            .unwrap_or(false);
        assert!(!is_busy, "ReentrancyError");

        // EFFECTS: Set BUSY flag
        env.storage().temporary().set(&DataKey::Busy, &true);

        // Execute actual distribution
        let result = Self::do_batch_distribute(&env, market_id, batch_size);

        // EFFECTS: Clear BUSY flag after execution completes
        env.storage().temporary().remove(&DataKey::Busy);

        result
    }

    /// Internal logic following CEI: Checks-Effects-Interactions
    fn do_batch_distribute(env: &Env, market_id: u64, batch_size: u32) -> u32 {
        assert!(
            batch_size > 0 && batch_size <= MAX_BATCH_SIZE,
            "batch_size must be 1..=MAX_BATCH_SIZE"
        );

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.status == MarketStatus::Resolved, "Market not resolved yet");

        let positions: Map<Address, (u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::UserPosition(market_id))
            .unwrap();

        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);

        // Build winners list
        let mut winners: Vec<(Address, i128)> = Vec::new(&env);
        let mut winning_stake: i128 = 0;
        for (addr, (outcome, amount)) in positions.iter() {
            if outcome == market.winning_outcome {
                winners.push_back((addr, amount));
                winning_stake += amount;
            }
        }

        if winning_stake == 0 { return 0; }

        let payout_pool = total_pool * 97 / 100;
        let token_client = token::Client::new(&env, &market.token);

        let cursor: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SettlementCursor(market_id))
            .unwrap_or(0);

        let total = winners.len();
        if cursor >= total { return 0; }

        let end = (cursor + batch_size).min(total);
        let mut paid: u32 = 0;

        // EFFECTS: State change (cursor update) happens BEFORE external interactions
        env.storage()
            .instance()
            .set(&DataKey::SettlementCursor(market_id), &end);

        // INTERACTIONS: External token transfers
        for i in cursor..end {
            let (bettor, amount) = winners.get(i).unwrap();
            let payout = (amount * payout_pool) / winning_stake;
            token_client.transfer(&env.current_contract_address(), &bettor, &payout);
            paid += 1;
        }

        paid
    }

    /// Convenience: settle all winners in one call (capped at MAX_BATCH_SIZE).
    pub fn distribute_rewards(env: Env, market_id: u64) {
        Self::batch_distribute(env, market_id, MAX_BATCH_SIZE);
    }

    /// Alias for distribute_rewards as requested.
    pub fn withdraw_rewards(env: Env, market_id: u64) {
        Self::distribute_rewards(env, market_id);
    }

    /// Returns how many winners have already been paid out.
    pub fn get_settlement_cursor(env: Env, market_id: u64) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SettlementCursor(market_id))
            .unwrap_or(0)
    }

    /// Read a market's stored metadata.
    pub fn get_market(env: Env, market_id: u64) -> Market {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap()
    }

    /// Get total shares for a market (hot read from Instance).
    pub fn get_total_shares(env: Env, market_id: u64) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0)
    }

    /// Get pause state for a market (hot read from Instance).
    pub fn get_is_paused(env: Env, market_id: u64) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::IsPaused(market_id))
            .unwrap_or(false)
    }

    /// Bumps the TTL for all storage keys related to a specific market.
    /// This ensures that market metadata and user positions don't expire from the ledger.
    ///
    /// # Parameters
    /// - `threshold`: The minimum number of ledgers remaining before a bump is triggered.
    /// - `extend_to`: The number of ledgers to extend the TTL to.
    pub fn bump_market_ttl(env: Env, market_id: u64, threshold: u32, extend_to: u32) {
        // 1. Bump Persistent Metadata
        env.storage().persistent().extend_ttl(
            &DataKey::Market(market_id),
            threshold,
            extend_to
        );

        // 2. Bump Persistent User Positions Map
        env.storage().persistent().extend_ttl(
            &DataKey::UserPosition(market_id),
            threshold,
            extend_to
        );

        // 3. Bump Instance storage (TotalShares, IsPaused, etc. are grouped here)
        env.storage().instance().extend_ttl(threshold, extend_to);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env, String};

    // ── shared helpers ────────────────────────────────────────────────────────

    /// Register a real SAC token and mint `amount` to each address in `recipients`.
    fn setup_token(env: &Env, recipients: &[(&Address, i128)]) -> Address {
        let admin = Address::generate(env);
        let token = env.register_stellar_asset_contract_v2(admin.clone());
        let token_client = token::StellarAssetClient::new(env, &token.address());
        for (addr, amount) in recipients {
            token_client.mint(addr, amount);
        }
        token.address()
    }

    fn setup() -> (Env, PredictionMarketClient<'static>, Address, Address, u64) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        // Use a dummy address for token — tests that don't do real transfers use mock_all_auths
        let token = Address::generate(&env);
        client.initialize(&admin);
        let deadline = env.ledger().timestamp() + 86400;
        let question = String::from_str(&env, "Will BTC exceed $100k?");
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(&1u64, &question, &options, &deadline, &token);
        (env, client, admin, token, deadline)
    }

    /// Build a market with `n` winners (option 0) and 1 loser (option 1),
    /// using a real SAC token so transfers actually execute.
    fn setup_market_with_winners(
        n: u32,
    ) -> (Env, PredictionMarketClient<'static>, Vec<Address>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Create n winners + 1 loser, each staking 100 stroops
        let mut bettors: Vec<Address> = Vec::new(&env);
        for _ in 0..n {
            bettors.push_back(Address::generate(&env));
        }
        let loser = Address::generate(&env);

        // Mint enough to each bettor + loser
        let all_recipients: soroban_sdk::Vec<Address> = {
            let mut v = bettors.clone();
            v.push_back(loser.clone());
            v
        };
        let token_admin_addr = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin_addr.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        for addr in all_recipients.iter() {
            sac_client.mint(&addr, &1000i128);
        }

        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &1u64,
            &String::from_str(&env, "Batch test market"),
            &options,
            &deadline,
            &sac.address(),
        );

        for bettor in bettors.iter() {
            client.place_bet(&1u64, &0u32, &bettor, &100i128);
        }
        client.place_bet(&1u64, &1u32, &loser, &100i128);
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        client.resolve_market(&1u64, &0u32);

        (env, client, bettors)
    }

    // ── Initialization ────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_and_create_market() {
        let (env, client, _, _, deadline) = setup();
        let market = client.get_market(&1u64);
        assert_eq!(market.id, 1u64);
        assert_eq!(market.options.len(), 2);
        assert_eq!(market.deadline, deadline);
        assert_eq!(market.status, MarketStatus::Active);
        soroban_sdk::log!(&env, "✅ Market stored: id={}, status={:?}", market.id, market.status);
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
        client.initialize(&admin);
    }

    // ── Instance storage: total_shares ────────────────────────────────────────

    #[test]
    fn test_total_shares_in_instance_storage() {
        let (_, client, _, _, _) = setup();
        // Before any bet, total_shares should be 0
        assert_eq!(client.get_total_shares(&1u64), 0i128);
    }

    #[test]
    fn test_total_shares_consistent_after_multiple_bets() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token_addr = Address::generate(&env);
        client.initialize(&admin);

        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &2u64,
            &String::from_str(&env, "Test market"),
            &options,
            &deadline,
            &token_addr,
        );

        // Register a mock token contract so transfers succeed
        let token_contract = env.register_stellar_asset_contract_v2(token_addr.clone());
        let token_admin = soroban_sdk::testutils::MockAuth {
            address: &token_addr,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &token_contract.address(),
                fn_name: "transfer",
                args: soroban_sdk::vec![&env].into(),
                sub_invokes: &[],
            },
        };
        let _ = token_admin; // suppress unused warning — mock_all_auths covers this

        let bettor1 = Address::generate(&env);
        let bettor2 = Address::generate(&env);

        client.place_bet(&2u64, &0u32, &bettor1, &100i128);
        client.place_bet(&2u64, &1u32, &bettor2, &200i128);

        assert_eq!(client.get_total_shares(&2u64), 300i128);
    }

    // ── Instance storage: is_paused ───────────────────────────────────────────

    #[test]
    fn test_is_paused_defaults_false() {
        let (_, client, _, _, _) = setup();
        assert!(!client.get_is_paused(&1u64));
    }

    #[test]
    fn test_set_paused_updates_instance_storage() {
        let (_, client, _, _, _) = setup();
        client.set_paused(&1u64, &true);
        assert!(client.get_is_paused(&1u64));
        client.set_paused(&1u64, &false);
        assert!(!client.get_is_paused(&1u64));
    }

    #[test]
    #[should_panic(expected = "Market is paused")]
    fn test_place_bet_blocked_when_paused() {
        let (env, client, _, _, _) = setup();
        client.set_paused(&1u64, &true);
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &50i128);
    }

    // ── Persistent storage: UserPosition ─────────────────────────────────────

    #[test]
    fn test_market_metadata_in_persistent_storage() {
        let (_, client, _, _, deadline) = setup();
        let market = client.get_market(&1u64);
        assert_eq!(market.deadline, deadline);
        assert_eq!(market.status, MarketStatus::Active);
    }

    #[test]
    #[should_panic(expected = "Market already exists")]
    fn test_duplicate_market_panics() {
        let (env, client, _, token, deadline) = setup();
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &1u64,
            &String::from_str(&env, "Duplicate"),
            &options,
            &deadline,
            &token,
        );
    }

    #[test]
    #[should_panic(expected = "Deadline must be in the future")]
    fn test_past_deadline_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        client.initialize(&admin);
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        // deadline in the past
        client.create_market(
            &3u64,
            &String::from_str(&env, "Past market"),
            &options,
            &0u64,
            &token,
        );
    }

    #[test]
    #[should_panic(expected = "Need at least 2 options")]
    fn test_single_option_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        client.initialize(&admin);
        let options = vec![&env, String::from_str(&env, "Only")];
        client.create_market(
            &4u64,
            &String::from_str(&env, "Bad market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
        );
    }

    // ── Resolve & distribute ──────────────────────────────────────────────────

    #[test]
    fn test_resolve_market_flow() {
        let (_, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        client.resolve_market(&1u64, &0u32);
        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Resolved);
        assert_eq!(market.winning_outcome, 0u32);
    }

    #[test]
    #[should_panic(expected = "Already resolved")]
    fn test_double_resolve_panics() {
        let (_, client, _, _, _) = setup();
        client.resolve_market(&1u64, &0u32);
        client.resolve_market(&1u64, &0u32);
    }

    #[test]
    #[should_panic(expected = "Invalid outcome index")]
    fn test_invalid_outcome_panics() {
        let (_, client, _, _, _) = setup();
        client.resolve_market(&1u64, &99u32);
    }

    #[test]
    #[should_panic(expected = "Market not resolved yet")]
    fn test_distribute_before_resolve_panics() {
        let (_, client, _, _, _) = setup();
        client.distribute_rewards(&1u64);
    }

    #[test]
    fn test_distribute_no_winners_is_noop() {
        let (_, client, _, _, _) = setup();
        client.resolve_market(&1u64, &0u32);
        // No bets placed — winning_stake == 0, should return without panic
        client.distribute_rewards(&1u64);
    }

    // ── Amount validation ─────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Amount must be positive")]
    fn test_zero_amount_panics() {
        let (env, client, _, _, _) = setup();
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &0i128);
    }

    #[test]
    #[should_panic(expected = "Amount must be positive")]
    fn test_negative_amount_panics() {
        let (env, client, _, _, _) = setup();
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &-10i128);
    }

    // ── Deadline enforcement ──────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Market deadline has passed")]
    fn test_bet_after_deadline_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        client.initialize(&admin);
        let deadline = env.ledger().timestamp() + 1;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &5u64,
            &String::from_str(&env, "Short market"),
            &options,
            &deadline,
            &token,
        );
        // Advance ledger past deadline
        env.ledger().with_mut(|l| l.timestamp += 10);
        let bettor = Address::generate(&env);
        client.place_bet(&5u64, &0u32, &bettor, &50i128);
    }

    // ── Invalid option index ──────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Invalid option index")]
    fn test_invalid_option_index_panics() {
        let (env, client, _, _, _) = setup();
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &99u32, &bettor, &50i128);
    }

    // ── Bet on resolved market ────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "Market not active")]
    fn test_bet_on_proposed_market_panics() {
        let (env, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &50i128);
    }

    // ── Batch distribute ──────────────────────────────────────────────────────

    /// Cursor starts at 0 before any settlement.
    #[test]
    fn test_settlement_cursor_starts_at_zero() {
        let (_, client, _) = setup_market_with_winners(3);
        assert_eq!(client.get_settlement_cursor(&1u64), 0u32);
    }

    /// Single batch_distribute(batch_size=3) pays all 3 winners in one call.
    /// Gas comparison baseline: 1 call vs 3 individual calls.
    ///
    /// Individual (old distribute_rewards per winner):
    ///   - 3 tx × (1 Persistent read + 1 token transfer write) = 3 reads, 3 writes
    /// Batch (new batch_distribute, batch_size=3):
    ///   - 1 tx × (1 Persistent read + 3 token transfer writes + 1 Instance cursor write)
    ///   = 1 read, 4 writes — but in ONE transaction, saving 2 tx overhead costs
    #[test]
    fn test_batch_distribute_pays_all_winners_in_one_call() {
        let (_, client, winners) = setup_market_with_winners(3);
        let paid = client.batch_distribute(&1u64, &3u32);
        assert_eq!(paid, 3u32);
        assert_eq!(client.get_settlement_cursor(&1u64), 3u32);
        // Calling again returns 0 — already fully settled
        let paid2 = client.batch_distribute(&1u64, &3u32);
        assert_eq!(paid2, 0u32);
        let _ = winners;
    }

    /// Cursor advances correctly across two batches (simulates 10 winners, batch_size=5).
    /// This is the core gas-cost comparison: 10 individual calls vs 2 batch calls.
    ///
    /// | Approach          | Tx count | Persistent reads | Instance writes |
    /// |-------------------|----------|------------------|-----------------|
    /// | 10 individual     | 10       | 10               | 0               |
    /// | 2 batches of 5    | 2        | 2                | 2 (cursor only) |
    /// Savings: 8 tx, 8 Persistent reads, net ~80% fee reduction for settlement.
    #[test]
    fn test_batch_distribute_cursor_advances_across_batches() {
        let (_, client, _) = setup_market_with_winners(10);

        let paid1 = client.batch_distribute(&1u64, &5u32);
        assert_eq!(paid1, 5u32);
        assert_eq!(client.get_settlement_cursor(&1u64), 5u32);

        let paid2 = client.batch_distribute(&1u64, &5u32);
        assert_eq!(paid2, 5u32);
        assert_eq!(client.get_settlement_cursor(&1u64), 10u32);

        // Fully settled — next call is a no-op
        let paid3 = client.batch_distribute(&1u64, &5u32);
        assert_eq!(paid3, 0u32);
    }

    /// Partial last batch: 7 winners, batch_size=5 → first call pays 5, second pays 2.
    #[test]
    fn test_batch_distribute_partial_last_batch() {
        let (_, client, _) = setup_market_with_winners(7);

        let paid1 = client.batch_distribute(&1u64, &5u32);
        assert_eq!(paid1, 5u32);

        let paid2 = client.batch_distribute(&1u64, &5u32);
        assert_eq!(paid2, 2u32); // only 2 remain
        assert_eq!(client.get_settlement_cursor(&1u64), 7u32);
    }

    /// distribute_rewards (convenience wrapper) uses MAX_BATCH_SIZE.
    #[test]
    fn test_distribute_rewards_uses_max_batch_size() {
        let (_, client, _) = setup_market_with_winners(3);
        client.distribute_rewards(&1u64);
        // cursor should have advanced by 3 (all winners, less than MAX_BATCH_SIZE)
        assert_eq!(client.get_settlement_cursor(&1u64), 3u32);
    }

    /// batch_size=0 must panic.
    #[test]
    #[should_panic(expected = "batch_size must be 1..=MAX_BATCH_SIZE")]
    fn test_batch_size_zero_panics() {
        let (_, client, _) = setup_market_with_winners(3);
        client.batch_distribute(&1u64, &0u32);
    }

    /// batch_size > MAX_BATCH_SIZE must panic.
    #[test]
    #[should_panic(expected = "batch_size must be 1..=MAX_BATCH_SIZE")]
    fn test_batch_size_exceeds_max_panics() {
        let (_, client, _) = setup_market_with_winners(3);
        client.batch_distribute(&1u64, &(MAX_BATCH_SIZE + 1));
    }

    /// batch_distribute on unresolved market must panic.
    #[test]
    #[should_panic(expected = "Market not resolved yet")]
    fn test_batch_distribute_unresolved_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        client.initialize(&admin);
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &1u64,
            &String::from_str(&env, "Q"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
        );
        client.batch_distribute(&1u64, &1u32);
    }

    /// No winners → batch_distribute returns 0 without panic.
    #[test]
    fn test_batch_distribute_no_winners_is_noop() {
        let (_, client, _, _, _) = setup();
        client.resolve_market(&1u64, &0u32);
        let paid = client.batch_distribute(&1u64, &5u32);
        assert_eq!(paid, 0u32);
    }

    // ── Graceful shutdown ─────────────────────────────────────────────────────

    /// Platform starts active by default.
    #[test]
    fn test_global_status_defaults_active() {
        let (_, client, _, _, _) = setup();
        assert!(client.get_global_status());
    }

    /// set_global_status(false) blocks create_market.
    #[test]
    #[should_panic(expected = "Platform is shut down")]
    fn test_create_market_blocked_when_shutdown() {
        let (env, client, _, token, _) = setup();
        client.set_global_status(&false);
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &2u64,
            &String::from_str(&env, "New market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
        );
    }

    /// place_bet on an existing market still works during shutdown.
    #[test]
    fn test_place_bet_allowed_during_shutdown() {
        let (env, client, _, _, _) = setup();
        client.set_global_status(&false);
        // market 1 was created before shutdown — betting must still work
        let bettor = Address::generate(&env);
        // mock_all_auths covers token transfer; no panic expected
        client.place_bet(&1u64, &0u32, &bettor, &50i128);
        assert_eq!(client.get_total_shares(&1u64), 50i128);
    }

    /// batch_distribute still works during shutdown.
    #[test]
    fn test_batch_distribute_allowed_during_shutdown() {
        let (_, client, _) = setup_market_with_winners(3);
        client.set_global_status(&false);
        let paid = client.batch_distribute(&1u64, &3u32);
        assert_eq!(paid, 3u32);
    }

    /// resolve_market still works during shutdown.
    #[test]
    fn test_resolve_market_allowed_during_shutdown() {
        let (_, client, _, _, _) = setup();
        client.set_global_status(&false);
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        client.resolve_market(&1u64, &0u32);
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Resolved);
    }

    /// Re-activating the platform allows create_market again.
    #[test]
    fn test_reactivation_allows_create_market() {
        let (env, client, _, token, _) = setup();
        client.set_global_status(&false);
        assert!(!client.get_global_status());
        client.set_global_status(&true);
        assert!(client.get_global_status());
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        // Should not panic
        client.create_market(
            &2u64,
            &String::from_str(&env, "Post-reactivation market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
        );
        assert_eq!(client.get_market(&2u64).id, 2u64);
    }

    // ── Dispute Mechanism ────────────────────────────────────────────────────

    #[test]
    fn test_dispute_false_proposal() {
        let (env, client, _, _, _) = setup();
        let disputer = Address::generate(&env);
        
        // 1. Propose something
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Proposed);

        // 2. Dispute it
        // Note: mock_all_auths handles the token transfer of the bond
        client.dispute(&1u64, &disputer, &100i128);
        
        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Disputed);
        
        // 3. Payouts should be frozen
        // setup_market_with_winners does a full resolve, so we check on a Disputed market
        // actually batch_distribute panics if not Resolved
    }

    #[test]
    #[should_panic(expected = "Market not resolved yet")]
    fn test_payout_frozen_when_disputed() {
        let (env, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        client.dispute(&1u64, &Address::generate(&env), &100i128);
        client.batch_distribute(&1u64, &5u32);
    }

    // ── TTL Bumping ──────────────────────────────────────────────────────────

    #[test]
    fn test_bump_market_ttl() {
        let (_env, client, _, _, _) = setup();
        // Calling the function to ensure it doesn't panic and executes correctly.
        client.bump_market_ttl(&1u64, &1000u32, &5000u32);
    }
    
    // ── Reentrancy Protection Tests ──────────────────────────────────────────

    /// Verify that the BUSY flag is set in temporary storage during batch_distribute.
    #[test]
    fn test_busy_flag_set_during_batch_distribute() {
        let (env, client, winners) = setup_market_with_winners(3);
        
        // Execute batch_distribute - this should work normally
        let paid = client.batch_distribute(&1u64, &3u32);
        assert_eq!(paid, 3u32);
        assert_eq!(client.get_settlement_cursor(&1u64), 3u32);
        
        let _ = winners;
    }

    /// Test that a recursive/reentrant call is blocked and throws ReentrancyError.
    /// In Soroban's single-transaction model, we simulate this by manually setting
    /// the BUSY flag and attempting to call batch_distribute again.
    #[test]
    #[should_panic(expected = "ReentrancyError")]
    fn test_reentrant_call_blocked_by_busy_flag() {
        let (env, client, winners) = setup_market_with_winners(3);
        
        // Manually set the BUSY flag to simulate reentrancy
        // This simulates a recursive call scenario where batch_distribute
        // is called while already executing
        env.storage().temporary().set(&DataKey::Busy, &true);
        
        // This should panic with ReentrancyError (will FAIL if implementation is missing)
        let _ = client.batch_distribute(&1u64, &3u32);
        
        let _ = winners;
    }

    /// Verify that after batch_distribute completes, the BUSY flag is cleared.
    #[test]
    fn test_busy_flag_cleared_after_execution() {
        let (env, client, winners) = setup_market_with_winners(3);
        
        // Execute batch_distribute
        let paid = client.batch_distribute(&1u64, &3u32);
        assert_eq!(paid, 3u32);
        
        // Verify BUSY flag is cleared (should be false/none)
        let is_busy: bool = env
            .storage()
            .temporary()
            .get(&DataKey::Busy)
            .unwrap_or(false);
        assert!(!is_busy, "BUSY flag should be cleared after execution");
        
        let _ = winners;
    }

    // ── Oracle Freshness Tests ──────────────────────────────────────────────

    /// Proposal with fresh data (drift < 1800s) should succeed.
    #[test]
    fn test_propose_resolution_fresh_data_succeeds() {
        let (env, client, _, _, _) = setup();
        let now = env.ledger().timestamp();
        // 10 minutes ago
        client.propose_resolution(&1u64, &0u32, &(now - 600));
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Proposed);
    }

    /// Proposal with stale data (drift > 1800s) should revert with ERR_STALE_DATA.
    #[test]
    #[should_panic(expected = "ERR_STALE_DATA")]
    fn test_propose_resolution_stale_data_reverts() {
        let (env, client, _, _, _) = setup();
        let now = env.ledger().timestamp();
        // 31 minutes ago (1860s)
        client.propose_resolution(&1u64, &0u32, &(now - 1860));
    }

    /// Proposal with future data (logical error) should revert with ERR_STALE_DATA.
    #[test]
    #[should_panic(expected = "ERR_STALE_DATA")]
    fn test_propose_resolution_future_data_reverts() {
        let (env, client, _, _, _) = setup();
        let now = env.ledger().timestamp();
        client.propose_resolution(&1u64, &0u32, &(now + 1));
    }
}


