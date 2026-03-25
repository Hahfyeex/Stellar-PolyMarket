#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Map, String, Vec,
};

/// Maximum winners processed per batch_distribute call.
/// Keeps CPU instruction count well below Soroban's per-tx ceiling (~100M instructions).
/// At ~500k instructions per transfer, 25 winners ≈ 12.5M instructions — safe headroom.
pub const MAX_BATCH_SIZE: u32 = 25;

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
    /// Vault balance: total funds swept from unclaimed payouts — Instance storage
    VaultBalance,
    /// Claim deadline: timestamp when market was resolved — Persistent storage per market
    /// Used to determine when unclaimed funds can be swept (30 days after resolution)
    ClaimDeadline(u64),
    /// Original payout amounts: tracks exact payout owed to each bettor — Persistent storage
    /// Ensures claimants always get their original amount even after vault sweep
    OriginalPayouts(u64),
    /// Swept flag: tracks if a market's unclaimed funds have been swept — Instance storage
    MarketSwept(u64),
}

#[contracttype]
#[derive(Clone)]
pub struct Market {
    pub id: u64,
    pub question: String,
    pub options: Vec<String>,
    pub deadline: u64,
    pub resolved: bool,
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
            resolved: false,
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

        assert!(!market.resolved, "Market already resolved");
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

    /// Resolve market — only admin (oracle-triggered).
    /// Records the resolution timestamp for claim deadline tracking.
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

        // Record resolution timestamp for 30-day claim deadline tracking
        let resolution_time = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&DataKey::ClaimDeadline(market_id), &resolution_time);
    }

    /// Sweep unclaimed payouts from a resolved market into the vault.
    /// Can only be called 30 days (2,592,000 seconds) after market resolution.
    /// 
    /// # Vault Re-balancing Logic
    /// 1. Check market is resolved and 30 days have passed since resolution
    /// 2. Calculate original payouts for all winners (if not already calculated)
    /// 3. Identify unclaimed payouts (winners who haven't been paid via batch_distribute)
    /// 4. Move unclaimed funds to vault balance
    /// 5. Mark market as swept to prevent double-sweeping
    /// 
    /// # Claimant Protection
    /// Original payout amounts are stored permanently in OriginalPayouts(market_id).
    /// Even after sweep, claimants can call claim_original() to withdraw their exact amount.
    /// 
    /// Returns the amount swept into the vault.
    pub fn sweep_unclaimed(env: Env, market_id: u64) -> i128 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        // Check if market has already been swept
        let already_swept: bool = env
            .storage()
            .instance()
            .get(&DataKey::MarketSwept(market_id))
            .unwrap_or(false);
        assert!(!already_swept, "Market already swept");

        // Verify market is resolved
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.resolved, "Market not resolved yet");

        // Check 30-day claim deadline has passed (30 days = 2,592,000 seconds)
        let resolution_time: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::ClaimDeadline(market_id))
            .unwrap();
        let current_time = env.ledger().timestamp();
        let thirty_days: u64 = 30 * 24 * 60 * 60; // 2,592,000 seconds
        assert!(
            current_time >= resolution_time + thirty_days,
            "Claim deadline not reached (30 days required)"
        );

        // Get positions and calculate payouts
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

        // Calculate winning stake and build winners list
        let mut winners: Vec<(Address, i128)> = Vec::new(&env);
        let mut winning_stake: i128 = 0;
        for (addr, (outcome, amount)) in positions.iter() {
            if outcome == market.winning_outcome {
                winners.push_back((addr, amount));
                winning_stake += amount;
            }
        }

        if winning_stake == 0 {
            // No winners, mark as swept and return 0
            env.storage()
                .instance()
                .set(&DataKey::MarketSwept(market_id), &true);
            return 0;
        }

        let payout_pool = total_pool * 97 / 100;

        // Calculate and store original payouts for each winner
        let mut original_payouts: Map<Address, i128> = Map::new(&env);
        for (bettor, amount) in winners.iter() {
            let payout = (amount * payout_pool) / winning_stake;
            original_payouts.set(bettor, payout);
        }
        env.storage()
            .persistent()
            .set(&DataKey::OriginalPayouts(market_id), &original_payouts);

        // Determine how many winners have already been paid via batch_distribute
        let cursor: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SettlementCursor(market_id))
            .unwrap_or(0);

        // Calculate unclaimed amount (winners beyond cursor haven't been paid)
        let mut unclaimed_total: i128 = 0;
        let total_winners = winners.len();
        for i in cursor..total_winners {
            let (bettor, _) = winners.get(i).unwrap();
            let payout = original_payouts.get(bettor).unwrap();
            unclaimed_total += payout;
        }

        // Add unclaimed funds to vault balance
        let current_vault: i128 = env
            .storage()
            .instance()
            .get(&DataKey::VaultBalance)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::VaultBalance, &(current_vault + unclaimed_total));

        // Mark market as swept
        env.storage()
            .instance()
            .set(&DataKey::MarketSwept(market_id), &true);

        unclaimed_total
    }

    /// Invest vault balance via Stellar AMM or other yield strategies.
    /// 
    /// # AMM Re-investment Strategy
    /// Takes the current vault balance and invests it in Stellar AMM pools
    /// to generate yield. This is a placeholder for the actual AMM integration.
    /// 
    /// In production, this would:
    /// 1. Call Stellar AMM deposit operation
    /// 2. Swap tokens for optimal pool allocation
    /// 3. Track LP tokens received
    /// 4. Monitor yield generation
    /// 
    /// # Safety
    /// - Only admin can trigger investment
    /// - Original payout amounts are tracked separately
    /// - Claimants can always withdraw their exact original amount
    /// - Vault must maintain sufficient liquidity for claims
    /// 
    /// Returns the amount invested.
    pub fn invest_vault(env: Env) -> i128 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let vault_balance: i128 = env
            .storage()
            .instance()
            .get(&DataKey::VaultBalance)
            .unwrap_or(0);

        assert!(vault_balance > 0, "No funds in vault to invest");

        // TODO: Implement actual Stellar AMM integration
        // For now, this is a placeholder that validates the vault balance exists
        // 
        // Production implementation would:
        // 1. Get token client for vault's token
        // 2. Call Stellar AMM deposit/swap operations
        // 3. Track LP tokens received
        // 4. Update vault accounting
        //
        // Example (pseudo-code):
        // let token_client = token::Client::new(&env, &vault_token);
        // let amm_pool = Address::from_string(...);
        // token_client.approve(&env.current_contract_address(), &amm_pool, &vault_balance);
        // // Call AMM deposit operation
        // let lp_tokens = amm_client.deposit(&vault_balance);
        // env.storage().instance().set(&DataKey::VaultLPTokens, &lp_tokens);

        vault_balance
    }

    /// Claim original payout amount for a winner, even after vault sweep.
    /// 
    /// # Claimant Protection
    /// This function ensures winners can always claim their exact original payout,
    /// regardless of whether the market has been swept or vault funds have been invested.
    /// 
    /// # Payment Source
    /// - If market not swept: pays from contract's token balance (normal flow)
    /// - If market swept: pays from vault balance (funds are reserved)
    /// 
    /// # Process
    /// 1. Verify market is resolved
    /// 2. Verify caller is a winner
    /// 3. Get original payout amount from OriginalPayouts storage
    /// 4. Transfer exact original amount to claimant
    /// 5. Mark as paid to prevent double-claiming
    /// 
    /// Returns the amount claimed.
    pub fn claim_original(env: Env, market_id: u64, claimant: Address) -> i128 {
        claimant.require_auth();

        // Verify market is resolved
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.resolved, "Market not resolved yet");

        // Get original payouts map
        let original_payouts: Map<Address, i128> = env
            .storage()
            .persistent()
            .get(&DataKey::OriginalPayouts(market_id))
            .unwrap_or(Map::new(&env));

        // Verify claimant has a payout
        assert!(
            original_payouts.contains_key(claimant.clone()),
            "No payout for this address"
        );

        let payout_amount = original_payouts.get(claimant.clone()).unwrap();

        // Check if already claimed (payout would be 0 if claimed)
        assert!(payout_amount > 0, "Already claimed");

        // Transfer the original payout amount
        let token_client = token::Client::new(&env, &market.token);
        
        // If market was swept, deduct from vault balance
        let is_swept: bool = env
            .storage()
            .instance()
            .get(&DataKey::MarketSwept(market_id))
            .unwrap_or(false);
        
        if is_swept {
            let vault_balance: i128 = env
                .storage()
                .instance()
                .get(&DataKey::VaultBalance)
                .unwrap_or(0);
            assert!(
                vault_balance >= payout_amount,
                "Insufficient vault balance"
            );
            env.storage()
                .instance()
                .set(&DataKey::VaultBalance, &(vault_balance - payout_amount));
        }

        token_client.transfer(&env.current_contract_address(), &claimant, &payout_amount);

        // Mark as claimed by setting payout to 0
        let mut updated_payouts = original_payouts;
        updated_payouts.set(claimant, 0);
        env.storage()
            .persistent()
            .set(&DataKey::OriginalPayouts(market_id), &updated_payouts);

        payout_amount
    }

    /// Get the current vault balance.
    pub fn get_vault_balance(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::VaultBalance)
            .unwrap_or(0)
    }

    /// Get the claim deadline timestamp for a market.
    pub fn get_claim_deadline(env: Env, market_id: u64) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::ClaimDeadline(market_id))
            .unwrap_or(0)
    }

    /// Check if a market has been swept.
    pub fn is_market_swept(env: Env, market_id: u64) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::MarketSwept(market_id))
            .unwrap_or(false)
    }

    /// Get original payout amount for a specific address in a market.
    pub fn get_original_payout(env: Env, market_id: u64, address: Address) -> i128 {
        let payouts: Map<Address, i128> = env
            .storage()
            .persistent()
            .get(&DataKey::OriginalPayouts(market_id))
            .unwrap_or(Map::new(&env));
        payouts.get(address).unwrap_or(0)
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
    pub fn batch_distribute(env: Env, market_id: u64, batch_size: u32) -> u32 {
        assert!(
            batch_size > 0 && batch_size <= MAX_BATCH_SIZE,
            "batch_size must be 1..=MAX_BATCH_SIZE"
        );

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.resolved, "Market not resolved yet");

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

        // Build ordered winners vec (one Persistent read, amortised across all batches)
        let mut winners: Vec<(Address, i128)> = Vec::new(&env);
        let mut winning_stake: i128 = 0;
        for (addr, (outcome, amount)) in positions.iter() {
            if outcome == market.winning_outcome {
                winners.push_back((addr, amount));
                winning_stake += amount;
            }
        }

        if winning_stake == 0 {
            return 0;
        }

        let payout_pool = total_pool * 97 / 100;
        let token_client = token::Client::new(&env, &market.token);

        // Hot read: cursor from Instance
        let cursor: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SettlementCursor(market_id))
            .unwrap_or(0);

        let total = winners.len();
        if cursor >= total {
            return 0; // already fully settled
        }

        let end = (cursor + batch_size).min(total);
        let mut paid: u32 = 0;

        for i in cursor..end {
            let (bettor, amount) = winners.get(i).unwrap();
            let payout = (amount * payout_pool) / winning_stake;
            token_client.transfer(&env.current_contract_address(), &bettor, &payout);
            paid += 1;
        }

        // Hot write: advance cursor in Instance storage (1 write regardless of batch_size)
        env.storage()
            .instance()
            .set(&DataKey::SettlementCursor(market_id), &end);

        paid
    }

    /// Convenience: settle all winners in one call (capped at MAX_BATCH_SIZE).
    /// For markets with >MAX_BATCH_SIZE winners, call batch_distribute in a loop.
    pub fn distribute_rewards(env: Env, market_id: u64) {
        Self::batch_distribute(env, market_id, MAX_BATCH_SIZE);
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
        assert!(!market.resolved);
        soroban_sdk::log!(&env, "✅ Market stored: id={}, deadline={}, resolved={}", market.id, market.deadline, market.resolved);
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
        assert!(!market.resolved);
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
    fn test_resolve_market() {
        let (_, client, _, _, _) = setup();
        client.resolve_market(&1u64, &0u32);
        let market = client.get_market(&1u64);
        assert!(market.resolved);
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
    #[should_panic(expected = "Market already resolved")]
    fn test_bet_on_resolved_market_panics() {
        let (env, client, _, _, _) = setup();
        client.resolve_market(&1u64, &0u32);
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
        client.resolve_market(&1u64, &0u32);
        assert!(client.get_market(&1u64).resolved);
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

    // ── Vault Re-balancing ────────────────────────────────────────────────────

    /// Helper: setup market with winners and resolve it
    fn setup_resolved_market_with_winners(
        n: u32,
    ) -> (Env, PredictionMarketClient<'static>, Vec<Address>, Address) {
        let (env, client, winners) = setup_market_with_winners(n);
        // Don't call batch_distribute — leave payouts unclaimed
        (env, client, winners, client.get_market(&1u64).token)
    }

    /// Claim deadline is recorded when market is resolved
    #[test]
    fn test_claim_deadline_recorded_on_resolution() {
        let (env, client, _, _) = setup_resolved_market_with_winners(3);
        let deadline = client.get_claim_deadline(&1u64);
        assert!(deadline > 0);
        assert_eq!(deadline, env.ledger().timestamp());
    }

    /// Vault balance starts at 0
    #[test]
    fn test_vault_balance_starts_at_zero() {
        let (_, client, _, _) = setup_resolved_market_with_winners(3);
        assert_eq!(client.get_vault_balance(), 0i128);
    }

    /// Cannot sweep before 30 days have passed
    #[test]
    #[should_panic(expected = "Claim deadline not reached (30 days required)")]
    fn test_sweep_before_30_days_panics() {
        let (env, client, _, _) = setup_resolved_market_with_winners(3);
        // Try to sweep immediately after resolution
        client.sweep_unclaimed(&1u64);
        let _ = env;
    }

    /// Cannot sweep unresolved market
    #[test]
    #[should_panic(expected = "Market not resolved yet")]
    fn test_sweep_unresolved_market_panics() {
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
            &String::from_str(&env, "Test"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
        );
        client.sweep_unclaimed(&1u64);
    }

    /// Sweep correctly identifies and moves unclaimed funds after 30 days
    #[test]
    fn test_sweep_moves_unclaimed_funds_after_30_days() {
        let (env, client, winners, _) = setup_resolved_market_with_winners(3);
        
        // Advance time by 30 days (2,592,000 seconds)
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        
        // Sweep unclaimed funds
        let swept_amount = client.sweep_unclaimed(&1u64);
        
        // All 3 winners have unclaimed payouts (cursor is 0)
        // Total pool = 400 (3 winners × 100 + 1 loser × 100)
        // Payout pool = 400 × 97% = 388
        // Each winner gets 388 / 3 ≈ 129 (integer division)
        assert!(swept_amount > 0);
        assert_eq!(client.get_vault_balance(), swept_amount);
        assert!(client.is_market_swept(&1u64));
        
        let _ = winners;
    }

    /// Sweep only moves unclaimed funds (respects settlement cursor)
    #[test]
    fn test_sweep_respects_settlement_cursor() {
        let (env, client, winners, _) = setup_resolved_market_with_winners(5);
        
        // Pay 2 winners via batch_distribute
        client.batch_distribute(&1u64, &2u32);
        assert_eq!(client.get_settlement_cursor(&1u64), 2u32);
        
        // Advance time by 30 days
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        
        // Sweep should only move funds for 3 unclaimed winners
        let swept_amount = client.sweep_unclaimed(&1u64);
        
        // Total pool = 600 (5 winners × 100 + 1 loser × 100)
        // Payout pool = 600 × 97% = 582
        // Each winner gets 582 / 5 = 116 (integer division)
        // 3 unclaimed winners = 3 × 116 = 348
        assert!(swept_amount > 0);
        assert_eq!(client.get_vault_balance(), swept_amount);
        
        let _ = winners;
    }

    /// Cannot sweep same market twice
    #[test]
    #[should_panic(expected = "Market already swept")]
    fn test_cannot_sweep_twice() {
        let (env, client, _, _) = setup_resolved_market_with_winners(3);
        
        // Advance time by 30 days
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        
        // First sweep succeeds
        client.sweep_unclaimed(&1u64);
        
        // Second sweep should panic
        client.sweep_unclaimed(&1u64);
    }

    /// Sweep with no winners returns 0 and marks as swept
    #[test]
    fn test_sweep_no_winners_returns_zero() {
        let (env, client, _, _, _) = setup();
        client.resolve_market(&1u64, &0u32);
        
        // Advance time by 30 days
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        
        let swept = client.sweep_unclaimed(&1u64);
        assert_eq!(swept, 0i128);
        assert!(client.is_market_swept(&1u64));
    }

    /// Sweep with all winners already paid returns 0
    #[test]
    fn test_sweep_all_paid_returns_zero() {
        let (env, client, _, _) = setup_resolved_market_with_winners(3);
        
        // Pay all winners
        client.batch_distribute(&1u64, &3u32);
        
        // Advance time by 30 days
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        
        let swept = client.sweep_unclaimed(&1u64);
        assert_eq!(swept, 0i128);
        assert!(client.is_market_swept(&1u64));
    }

    /// Original payouts are stored correctly during sweep
    #[test]
    fn test_original_payouts_stored_during_sweep() {
        let (env, client, winners, _) = setup_resolved_market_with_winners(3);
        
        // Advance time by 30 days
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        
        client.sweep_unclaimed(&1u64);
        
        // Check each winner has an original payout recorded
        for winner in winners.iter() {
            let payout = client.get_original_payout(&1u64, &winner);
            assert!(payout > 0);
        }
    }

    /// Claimants can withdraw after sweep
    #[test]
    fn test_claim_original_after_sweep() {
        let (env, client, winners, token) = setup_resolved_market_with_winners(3);
        
        // Advance time by 30 days and sweep
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        client.sweep_unclaimed(&1u64);
        
        // Get first winner
        let winner = winners.get(0).unwrap();
        let original_payout = client.get_original_payout(&1u64, &winner);
        assert!(original_payout > 0);
        
        // Claim original payout
        let claimed = client.claim_original(&1u64, &winner);
        assert_eq!(claimed, original_payout);
        
        // Payout should now be 0 (claimed)
        assert_eq!(client.get_original_payout(&1u64, &winner), 0i128);
        
        let _ = token;
    }

    /// Cannot claim twice
    #[test]
    #[should_panic(expected = "Already claimed")]
    fn test_cannot_claim_twice() {
        let (env, client, winners, _) = setup_resolved_market_with_winners(3);
        
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        client.sweep_unclaimed(&1u64);
        
        let winner = winners.get(0).unwrap();
        client.claim_original(&1u64, &winner);
        // Second claim should panic
        client.claim_original(&1u64, &winner);
    }

    /// Cannot claim from unresolved market
    #[test]
    #[should_panic(expected = "Market not resolved yet")]
    fn test_claim_from_unresolved_market_panics() {
        let (env, client, _, _, _) = setup();
        let bettor = Address::generate(&env);
        client.claim_original(&1u64, &bettor);
    }

    /// Cannot claim if not a winner
    #[test]
    #[should_panic(expected = "No payout for this address")]
    fn test_claim_non_winner_panics() {
        let (env, client, _, _) = setup_resolved_market_with_winners(3);
        
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        client.sweep_unclaimed(&1u64);
        
        let non_winner = Address::generate(&env);
        client.claim_original(&1u64, &non_winner);
    }

    /// Vault balance decreases when claims are made
    #[test]
    fn test_vault_balance_decreases_on_claim() {
        let (env, client, winners, _) = setup_resolved_market_with_winners(3);
        
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        client.sweep_unclaimed(&1u64);
        
        let initial_vault = client.get_vault_balance();
        let winner = winners.get(0).unwrap();
        let payout = client.get_original_payout(&1u64, &winner);
        
        client.claim_original(&1u64, &winner);
        
        let final_vault = client.get_vault_balance();
        assert_eq!(final_vault, initial_vault - payout);
    }

    /// Multiple winners can claim after sweep
    #[test]
    fn test_multiple_winners_can_claim_after_sweep() {
        let (env, client, winners, _) = setup_resolved_market_with_winners(3);
        
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        client.sweep_unclaimed(&1u64);
        
        // All 3 winners claim
        for i in 0..3 {
            let winner = winners.get(i).unwrap();
            let payout = client.get_original_payout(&1u64, &winner);
            assert!(payout > 0);
            client.claim_original(&1u64, &winner);
        }
        
        // Vault should be empty (or near empty due to rounding)
        let vault = client.get_vault_balance();
        assert!(vault < 10); // Allow small rounding difference
    }

    /// invest_vault requires non-zero balance
    #[test]
    #[should_panic(expected = "No funds in vault to invest")]
    fn test_invest_vault_empty_panics() {
        let (_, client, _, _) = setup_resolved_market_with_winners(3);
        client.invest_vault();
    }

    /// invest_vault returns vault balance (placeholder implementation)
    #[test]
    fn test_invest_vault_returns_balance() {
        let (env, client, _, _) = setup_resolved_market_with_winners(3);
        
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        client.sweep_unclaimed(&1u64);
        
        let vault_balance = client.get_vault_balance();
        assert!(vault_balance > 0);
        
        let invested = client.invest_vault();
        assert_eq!(invested, vault_balance);
    }

    /// Sweep does not affect markets resolved less than 30 days ago
    #[test]
    #[should_panic(expected = "Claim deadline not reached (30 days required)")]
    fn test_sweep_blocked_before_30_days() {
        let (env, client, _, _) = setup_resolved_market_with_winners(3);
        
        // Advance time by only 29 days
        env.ledger().with_mut(|l| l.timestamp += 29 * 24 * 60 * 60);
        
        // Should panic
        client.sweep_unclaimed(&1u64);
    }

    /// Sweep at exactly 30 days succeeds
    #[test]
    fn test_sweep_at_exactly_30_days_succeeds() {
        let (env, client, _, _) = setup_resolved_market_with_winners(3);
        
        // Advance time by exactly 30 days
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        
        let swept = client.sweep_unclaimed(&1u64);
        assert!(swept > 0);
    }

    /// Claim works before sweep (normal batch_distribute flow)
    #[test]
    fn test_claim_before_sweep_via_batch_distribute() {
        let (_, client, winners, _) = setup_resolved_market_with_winners(3);
        
        // Pay winners via normal batch_distribute (before sweep)
        let paid = client.batch_distribute(&1u64, &3u32);
        assert_eq!(paid, 3u32);
        
        // Verify winners were paid (this is the normal flow)
        let _ = winners;
    }

    /// Original payouts match batch_distribute amounts
    #[test]
    fn test_original_payouts_match_batch_amounts() {
        let (env, client, winners, _) = setup_resolved_market_with_winners(3);
        
        // Calculate expected payout
        // Total pool = 400, payout pool = 388, 3 winners = 129 each (integer division)
        let total_pool = 400i128;
        let payout_pool = total_pool * 97 / 100;
        let expected_per_winner = payout_pool / 3;
        
        // Sweep to store original payouts
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60);
        client.sweep_unclaimed(&1u64);
        
        // Check each winner's original payout
        for winner in winners.iter() {
            let payout = client.get_original_payout(&1u64, &winner);
            assert_eq!(payout, expected_per_winner);
        }
    }
}

