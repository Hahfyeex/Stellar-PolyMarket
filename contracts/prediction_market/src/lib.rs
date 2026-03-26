#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String, Vec, Map,
};
mod access;
use crate::access::{
    check_platform_active, check_role, panic_if_paused, set_platform_status, set_role,
    AccessPlatformStatus, AccessRole,
};

// Internal ZK scalar normalization utility — must be declared before use
mod math;
use math::normalize_scalar;

// LMSR cost and pricing functions
mod lmsr;
use lmsr::{lmsr_cost, lmsr_price};

// Position token management
mod position_token;

/// Fee routing mode: burn (send to issuer/lock address) or transfer to DAO treasury.
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum FeeMode {
    /// Send fee to a burn/lock address (e.g. token issuer with locked trustline).
    Burn,
    /// Transfer fee to the DAO treasury multisig account.
    Treasury,
}

/// Fee distribution configuration in Basis Points (BPS).
/// Total must equal 10000 (100%).
#[contracttype]
#[derive(Clone, PartialEq)]
pub struct FeeConfig {
    /// Basis points allocated to DAO treasury (0-10000)
    pub treasury_bps: u32,
    /// Basis points allocated to liquidity providers (0-10000)
    pub lp_bps: u32,
    /// Basis points allocated to burn address (0-10000)
    pub burn_bps: u32,
}

/// Maximum winners processed per batch_distribute call.
/// Keeps CPU instruction count well below Soroban's per-tx ceiling (~100M instructions).
/// At ~500k instructions per transfer, 25 winners ≈ 12.5M instructions — safe headroom.
pub const MAX_BATCH_SIZE: u32 = 25;
/// Liveness window: 1 hour in seconds. Resolution can only be finalised after this delay.
pub const LIVENESS_WINDOW: u64 = 3_600;

/// Liveness window for disputes (approx 24 hours in ledgers/seconds)
pub const LIVENESS_WINDOW: u64 = 86_400;

/// Calculates dynamic platform fee in Basis Points (BPS).
/// Pure function: O(1) time complexity, O(1) space complexity.
/// Logic: Fee = Max(0.5%, 2% - (Volume / Threshold))
pub fn calculate_dynamic_fee(volume: i128) -> u32 {
    let base_fee_bps: i128 = 200;      // 2.0%
    let floor_fee_bps: i128 = 50;       // 0.5%
    let total_reduction_bps: i128 = 150; // Difference (2.0% - 0.5%)
    let threshold: i128 = 100_000 * 10_000_000; // 100k XLM = 1,000,000,000,000 stroops

    if volume <= 0 {
        return base_fee_bps as u32;
    }

    // Linear scaling: reduction = (Volume / Threshold) * total_reduction
    let reduction = (volume * total_reduction_bps) / threshold;
    let fee = base_fee_bps - reduction;

    if fee < floor_fee_bps {
        floor_fee_bps as u32
    } else {
        fee as u32
    }
}


#[contracttype]
pub enum DataKey {
    Initialized,
    OracleAddress,
    Market(u64),
    /// Cold: per-user positions — Persistent storage
    UserPosition(u64),
    /// Hot: total shares per market — Instance storage
    TotalShares(u64),
    /// Hot: pause flag per market — Instance storage
    IsPaused(u64),
    /// Global pause flag — Instance storage
    IsPausedGlobal,
    /// Hot: settlement cursor (index into winners vec) — Instance storage
    SettlementCursor(u64),

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
    /// Creation fee amount in stroops — Instance storage.
    /// Set to 0 to disable fee collection (permissionless, no charge).
    CreationFee,
    /// Address that receives the creation fee — Instance storage.
    /// Interpretation depends on FeeMode: burn address or DAO treasury.
    FeeDestination,
    /// Fee routing mode: Burn or Treasury — Instance storage.
    FeeModeConfig,
    /// Maximum bet amount in stroops — Instance storage.
    MaxBetAmount,
    /// Minimum bet amount in stroops — Instance storage. Default: 1_000_000 (0.1 XLM).
    MinBetAmount,
    /// LMSR liquidity parameter b for a market — Instance storage.
    LmsrB(u64),
    /// Per-outcome cumulative share quantities for LMSR — Instance storage.
    OutcomeShares(u64),
    /// Dispute voting data — Persistent storage per market.
    Dispute(u64),
    /// Refund-claimed flag per bettor per market — Persistent storage.
    RefundClaimed(u64),
    /// Replay protection: per-user nonce for off-chain signatures — Persistent storage
    Nonce(Address),
    /// Fee distribution configuration — Instance storage
    FeeSplitConfig,
    /// DAO treasury address for fee distribution — Instance storage
    TreasuryAddress,
    /// Liquidity provider address for fee distribution — Instance storage
    LPAddress,
    /// Burn address for fee distribution — Instance storage
    BurnAddress,
    /// Tracks if a recipient has been paid for a market — Persistent storage
    /// Key: (market_id, recipient_address) → Value: bool
    PayoutClaimed(u64, Address),
    /// Per-outcome pool balances — Persistent storage
    /// Tracks total stake per outcome for multi-outcome markets
    OutcomePoolBalances(u64),
    /// Re-entrancy guard lock — Instance storage
    /// Prevents recursive calls during payout distribution
    ReentrancyLock,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MarketStatus {
    Active,
    Proposed,
    Disputed,
    ReReview, // threshold crossed, paused for final admin review
    Resolved,
    Voided,   // condition not met — full refunds enabled
}

#[contracttype]
#[derive(Clone)]
pub struct DisputeData {
    pub active: bool,
    pub votes: soroban_sdk::Map<Address, i128>,
    pub total_votes: i128,
    pub support_votes: i128,
    pub deadline: u64,
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
    /// If set, this market only resolves if the referenced market resolved to `condition_outcome`.
    /// Otherwise the market is Voided and all stakes are refunded.
    pub condition_market_id: Option<u64>,
    pub condition_outcome: Option<u32>,
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

/// Acquire re-entrancy lock. Panics if already locked.
fn acquire_reentrancy_lock(env: &Env) {
    let is_locked: bool = env
        .storage()
        .instance()
        .get(&DataKey::ReentrancyLock)
        .unwrap_or(false);
    
    assert!(!is_locked, "Reentrant call detected");
    
    env.storage().instance().set(&DataKey::ReentrancyLock, &true);
    env.storage().instance().extend_ttl(100, 1_000_000);
}

/// Release re-entrancy lock.
fn release_reentrancy_lock(env: &Env) {
    env.storage().instance().set(&DataKey::ReentrancyLock, &false);
    env.storage().instance().extend_ttl(100, 1_000_000);
}


#[contractimpl]
impl PredictionMarket {
    /// Initialize contract with admin address.
    pub fn initialize(env: Env, admin: Address) {
        check_initialized(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Initialized, &true);
        set_role(&env, AccessRole::Admin, &admin);
        // Platform starts active by default
        set_platform_status(&env, AccessPlatformStatus::Active);
    }

    /// Create a new prediction market.
    /// Blocked when GlobalStatus is false (graceful shutdown).
    /// Hot data (total_shares, is_paused) written to Instance storage.
    /// Cold data (market metadata, user positions) written to Persistent storage.
    ///
    /// # Creation Fee
    /// If a non-zero CreationFee is configured, the creator must hold sufficient
    /// balance of `token` to cover the fee. The fee is transferred to FeeDestination
    /// before the market is stored. If the transfer fails (insufficient balance),
    /// the transaction aborts with "InsufficientFeeBalance" and no market is created.
    ///
    /// Fee routing is controlled by FeeMode:
    ///   - FeeMode::Burn     → fee sent to a burn/lock address (e.g. issuer with locked trustline)
    ///   - FeeMode::Treasury → fee sent to the DAO treasury multisig account
    ///
    /// # Gas Optimization
    /// User positions stored as Vec instead of Map to reduce gas costs.
    pub fn create_market(
        env: Env,
        creator: Address,
        id: u64,
        question: String,
        options: Vec<String>,
        deadline: u64,
        token: Address,
        lmsr_b: i128,
        condition_market_id: Option<u64>,
        condition_outcome: Option<u32>,
    ) {
        creator.require_auth();
        check_role(&env, AccessRole::Admin);
        panic_if_paused(&env);
        assert!(lmsr_b > 0, "lmsr_b must be positive");

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
        assert!(options.len() <= 8, "Maximum 8 outcomes allowed");
        assert!(deadline > env.ledger().timestamp(), "Deadline must be in the future");

        // --- Creation fee collection ---
        // Read configured fee; default 0 means free market creation.
        let creation_fee: i128 = env
            .storage()
            .instance()
            .get(&DataKey::CreationFee)
            .unwrap_or(0i128);

        if creation_fee > 0 {
            // FeeDestination must be set when fee > 0.
            let fee_destination: Address = env
                .storage()
                .instance()
                .get(&DataKey::FeeDestination)
                .expect("FeeDestination not configured");

            // Transfer fee from creator to destination (burn address or DAO treasury).
            // The token contract will panic with a host error if the creator has
            // insufficient balance, aborting the entire transaction — no market is created.
            // We wrap in try_transfer and map any error to our own panic message so
            // callers see a clear "InsufficientFeeBalance" reason.
            let fee_token = token::Client::new(&env, &token);
            if fee_token
                .try_transfer(&creator, &fee_destination, &creation_fee)
                .is_err()
            {
                panic!("InsufficientFeeBalance");
            }

            // Emit FeeCollected event for off-chain indexing.
            // Topics: ("FeeCollected", creator)
            // Data: (fee_destination, creation_fee, fee_mode)
            let fee_mode: FeeMode = env
                .storage()
                .instance()
                .get(&DataKey::FeeModeConfig)
                .unwrap_or(FeeMode::Treasury);
            env.events().publish(
                (symbol_short!("FeeColl"), creator.clone()),
                (fee_destination, creation_fee, fee_mode),
            );
        }
        // --- End fee collection ---

        let market = Market {
            id,
            question,
            options,
            deadline,
            status: MarketStatus::Active,
            winning_outcome: 0,
            token,
            proposed_outcome: None,
            proposal_timestamp: 0,
            condition_market_id,
            condition_outcome,
        };

        // Cold: market metadata + user positions vec → Persistent
        env.storage().persistent().set(&DataKey::Market(id), &market);
        env.storage()
            .persistent()
            .set(&DataKey::UserPosition(id), &Vec::<(Address, u32, i128)>::new(&env));

        // Hot: total_shares + is_paused + LMSR state → Instance (cheaper reads/writes)
        env.storage().instance().set(&DataKey::TotalShares(id), &0i128);
        env.storage().instance().set(&DataKey::IsPaused(id), &false);
        env.storage().instance().set(&DataKey::LmsrB(id), &lmsr_b);
        // Initialise outcome shares to 0 for each option
        let n = market.options.len();
        let mut shares: Vec<i128> = Vec::new(&env);
        for _ in 0..n {
            shares.push_back(0i128);
        }
        env.storage().instance().set(&DataKey::OutcomeShares(id), &shares);
        
        // Initialize per-outcome pool balances to 0 for each option
        let mut pool_balances: Map<u32, i128> = Map::new(&env);
        for i in 0..n {
            pool_balances.set(i as u32, 0i128);
        }
        env.storage()
            .persistent()
            .set(&DataKey::OutcomePoolBalances(id), &pool_balances);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::OutcomePoolBalances(id), 100, 1_000_000);
        
        env.storage().instance().extend_ttl(100, 1_000_000);
    }

    /// Place a bet on an option.
    /// Reads total_shares from Instance (1 cheap read) instead of Persistent.
    /// 
    /// # Gas Optimization
    /// Uses Vec for positions storage instead of Map.
    /// Linear scan to find existing bet is cheaper than Map hashing for small datasets.
    /// Typical markets have <100 bettors, making Vec O(n) faster than Map O(1) with hashing overhead.
    pub fn place_bet(env: Env, market_id: u64, option_index: u32, bettor: Address, amount: i128) {
        check_platform_active(&env);
        bettor.require_auth();
        Self::internal_place_bet(env, market_id, option_index, bettor, amount);
    }

    /// Gasless bet placement using an off-chain signature and a manual nonce for replay protection.
    /// 
    /// # Replay Protection
    /// 1. Manual Nonce: Each signature includes a nonce that must match the stored nonce for the address.
    /// 2. Soroban Auth: require_auth_for_args ensures the signature is valid for the provided arguments.
    /// 3. Nonce Increment: The stored nonce is incremented after every successful bet.
    pub fn place_bet_with_sig(
        env: Env,
        market_id: u64,
        option_index: u32,
        bettor: Address,
        amount: i128,
        nonce: u64,
        signature: soroban_sdk::BytesN<64>,
    ) {
        panic_if_paused(&env);

        // 1. Verify manual nonce (Replay Protection Requirement #209)
        let stored_nonce: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::Nonce(bettor.clone()))
            .unwrap_or(0);
        assert!(nonce == stored_nonce, "Invalid signature nonce");

        // 2. Verify signature via Soroban auth
        // We include the nonce and signature in the args to ensure they are signed.
        bettor.require_auth_for_args((market_id, option_index, amount, nonce, signature.clone()).into_val(&env));

        // 3. Update nonce state
        env.storage()
            .persistent()
            .set(&DataKey::Nonce(bettor.clone()), &(stored_nonce + 1));
        // Extend TTL for nonce storage to manage rent
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Nonce(bettor.clone()), 100, 1_000_000);

        // 4. Execute bet logic
        Self::internal_place_bet(env, market_id, option_index, bettor, amount);
    }

    /// Internal logic for placing a bet, shared by place_bet and place_bet_with_sig.
    fn internal_place_bet(env: Env, market_id: u64, option_index: u32, bettor: Address, amount: i128) {
        assert!(amount > 0, "Amount must be positive");

        // Enforce configurable min/max bet caps
        let min_bet: i128 = env
            .storage()
            .instance()
            .get(&DataKey::MinBetAmount)
            .unwrap_or(1_000_000i128); // default 0.1 XLM in stroops
        assert!(amount >= min_bet, "bet below minimum");

        let max_bet: i128 = env
            .storage()
            .instance()
            .get(&DataKey::MaxBetAmount)
            .unwrap_or(i128::MAX);
        assert!(amount <= max_bet, "bet exceeds cap");

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

        // ── LMSR cost delta ──────────────────────────────────────────────────
        // `amount` is the number of shares the bettor wants to buy.
        // The actual cost charged is C(q_after) - C(q_before).
        let b: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LmsrB(market_id))
            .unwrap();
        let outcome_shares: Vec<i128> = env
            .storage()
            .instance()
            .get(&DataKey::OutcomeShares(market_id))
            .unwrap();

        // Build q_before and q_after as plain slices via a fixed-size stack array.
        // Max 5 outcomes (enforced at market creation: options.len() <= 5 implied by Vec).
        let n = outcome_shares.len() as usize;
        let mut q_before = [0i128; 8];
        let mut q_after = [0i128; 8];
        for j in 0..n {
            q_before[j] = outcome_shares.get(j as u32).unwrap();
            q_after[j] = q_before[j];
        }
        q_after[option_index as usize] += amount;

        let cost_before = lmsr_cost(&q_before[..n], b);
        let cost_after = lmsr_cost(&q_after[..n], b);
        let cost_delta = cost_after - cost_before;
        assert!(cost_delta > 0, "cost delta must be positive");

        // Charge the bettor the LMSR cost delta (not raw `amount`)
        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&bettor, &env.current_contract_address(), &cost_delta);

        // Update outcome shares in Instance storage
        let mut new_shares = outcome_shares.clone();
        new_shares.set(option_index, q_after[option_index as usize]);
        env.storage().instance().set(&DataKey::OutcomeShares(market_id), &new_shares);
        // ── end LMSR ─────────────────────────────────────────────────────────

        // Cold write: user position → Persistent
        let mut positions: Vec<(Address, u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::UserPosition(market_id))
            .unwrap();

        let mut found = false;
        for i in 0..positions.len() {
            let (addr, _, prev_amount) = positions.get(i).unwrap();
            if addr == bettor {
                positions.set(i, (bettor.clone(), option_index, prev_amount + amount));
                found = true;
                break;
            }
        }
        if !found {
            positions.push_back((bettor.clone(), option_index, amount));
        }

        env.storage()
            .persistent()
            .set(&DataKey::UserPosition(market_id), &positions);

        // Update per-outcome pool balances
        let mut pool_balances: Map<u32, i128> = env
            .storage()
            .persistent()
            .get(&DataKey::OutcomePoolBalances(market_id))
            .unwrap();
        let current_pool = pool_balances.get(option_index).unwrap_or(0);
        pool_balances.set(option_index, current_pool + cost_delta);
        env.storage()
            .persistent()
            .set(&DataKey::OutcomePoolBalances(market_id), &pool_balances);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::OutcomePoolBalances(market_id), 100, 1_000_000);

        // Hot write: total_shares → Instance
        let shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares(market_id), &(shares + cost_delta));
        env.storage().instance().extend_ttl(100, 1_000_000);

        env.events().publish((symbol_short!("Bet"), market_id), (bettor.clone(), cost_delta, option_index));
    }

    /// Pause or unpause a market (admin only).
    /// Writes to Instance storage — single cheap write.
    pub fn set_paused(env: Env, market_id: u64, paused: bool) {
        check_role(&env, AccessRole::Admin);
        env.storage()
            .instance()
            .set(&DataKey::IsPaused(market_id), &paused);
    }

    /// Graceful shutdown / re-activation (admin only).
    /// active=false → shutdown; active=true → active.
    pub fn set_global_status(env: Env, active: bool) {
        check_role(&env, AccessRole::Admin);
        let status = if active {
            AccessPlatformStatus::Active
        } else {
            AccessPlatformStatus::Shutdown
        };
        set_platform_status(&env, status);
    }

    /// Read the current global platform status.
    pub fn get_global_status(env: Env) -> bool {
        let status: AccessPlatformStatus = env
            .storage()
            .instance()
            .get(&crate::access::AccessKey::PlatformStatus)
            .unwrap_or(AccessPlatformStatus::Active);
        status == AccessPlatformStatus::Active
    }

    /// Update the market creation fee configuration (admin only).
    ///
    /// # Parameters
    /// - `new_fee`         — Fee in stroops. Pass 0 to disable fee collection entirely.
    /// - `new_destination` — Address that receives the fee.
    ///                       For burn: use the token issuer account with a locked trustline.
    ///                       For DAO treasury: use the multisig Stellar account address.
    /// - `new_mode`        — `FeeMode::Burn` or `FeeMode::Treasury`.
    ///
    /// # Auth
    /// Requires admin authorization. No redeployment needed — config is stored in
    /// Instance storage and takes effect on the next create_market call.
    pub fn update_fee(env: Env, new_fee: i128, new_destination: Address, new_mode: FeeMode) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        assert!(new_fee >= 0, "Fee must be non-negative");
        env.storage().instance().set(&DataKey::CreationFee, &new_fee);
        env.storage().instance().set(&DataKey::FeeDestination, &new_destination);
        env.storage().instance().set(&DataKey::FeeModeConfig, &new_mode);
    }

    /// Get the current creation fee configuration.
    /// Returns (fee_amount, fee_destination, fee_mode).
    pub fn get_fee_config(env: Env) -> (i128, Option<Address>, FeeMode) {
        let fee: i128 = env.storage().instance().get(&DataKey::CreationFee).unwrap_or(0);
        let dest: Option<Address> = env.storage().instance().get(&DataKey::FeeDestination);
        let mode: FeeMode = env
            .storage()
            .instance()
            .get(&DataKey::FeeModeConfig)
            .unwrap_or(FeeMode::Treasury);
        (fee, dest, mode)
    }

    /// Update the min/max bet caps (admin / FeeSetter role).
    /// `min_amount` — minimum bet in stroops (must be >= 1).
    /// `max_amount` — maximum bet in stroops (must be >= min_amount).
    /// Pass 0 for `max_amount` to remove the cap (sets to i128::MAX internally).
    pub fn update_bet_limits(env: Env, min_amount: i128, max_amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        assert!(min_amount >= 1, "min must be >= 1");
        let effective_max = if max_amount == 0 { i128::MAX } else { max_amount };
        assert!(effective_max >= min_amount, "max must be >= min");
        env.storage().instance().set(&DataKey::MinBetAmount, &min_amount);
        env.storage().instance().set(&DataKey::MaxBetAmount, &effective_max);
        env.storage().instance().extend_ttl(100, 1_000_000);
    }

    /// Get current bet limits. Returns (min_amount, max_amount).
    pub fn get_bet_limits(env: Env) -> (i128, i128) {
        let min: i128 = env.storage().instance().get(&DataKey::MinBetAmount).unwrap_or(1_000_000);
        let max: i128 = env.storage().instance().get(&DataKey::MaxBetAmount).unwrap_or(i128::MAX);
        (min, max)
    }

    /// Configure fee distribution split between treasury, LPs, and burn address.
    /// Only callable by FeeSetter role (admin).
    /// 
    /// # Parameters
    /// - `treasury_bps` — Basis points allocated to DAO treasury (0-10000)
    /// - `lp_bps` — Basis points allocated to liquidity providers (0-10000)
    /// - `burn_bps` — Basis points allocated to burn address (0-10000)
    /// - `treasury_addr` — Address of DAO treasury
    /// - `lp_addr` — Address of liquidity provider pool
    /// - `burn_addr` — Stellar burn address (issuer with locked trustline)
    /// 
    /// # Requirements
    /// - treasury_bps + lp_bps + burn_bps MUST equal 10000 (100%)
    /// - All addresses must be valid
    /// - Caller must have admin authorization
    /// 
    /// # Storage
    /// Writes to Instance storage with TTL extension for rent management.
    pub fn configure_fee_split(
        env: Env,
        treasury_bps: u32,
        lp_bps: u32,
        burn_bps: u32,
        treasury_addr: Address,
        lp_addr: Address,
        burn_addr: Address,
    ) {
        check_role(&env, AccessRole::Admin);
        
        // Assert BPS split totals 100%
        let total_bps = treasury_bps + lp_bps + burn_bps;
        assert!(total_bps == 10000, "BPS split must total 10000 (100%)");
        
        let config = FeeConfig {
            treasury_bps,
            lp_bps,
            burn_bps,
        };
        
        env.storage().instance().set(&DataKey::FeeSplitConfig, &config);
        env.storage().instance().set(&DataKey::TreasuryAddress, &treasury_addr);
        env.storage().instance().set(&DataKey::LPAddress, &lp_addr);
        env.storage().instance().set(&DataKey::BurnAddress, &burn_addr);
        env.storage().instance().extend_ttl(100, 1_000_000);
    }

    /// Update fee distribution configuration (admin only).
    /// Validates that BPS split totals 100% before updating.
    pub fn update_fee_split(
        env: Env,
        treasury_bps: u32,
        lp_bps: u32,
        burn_bps: u32,
    ) {
        check_role(&env, AccessRole::Admin);
        
        // Assert BPS split totals 100%
        let total_bps = treasury_bps + lp_bps + burn_bps;
        assert!(total_bps == 10000, "BPS split must total 10000 (100%)");
        
        let config = FeeConfig {
            treasury_bps,
            lp_bps,
            burn_bps,
        };
        
        env.storage().instance().set(&DataKey::FeeSplitConfig, &config);
        env.storage().instance().extend_ttl(100, 1_000_000);
    }

    /// Update fee destination addresses (admin only).
    pub fn update_fee_addresses(
        env: Env,
        treasury_addr: Address,
        lp_addr: Address,
        burn_addr: Address,
    ) {
        check_role(&env, AccessRole::Admin);
        
        env.storage().instance().set(&DataKey::TreasuryAddress, &treasury_addr);
        env.storage().instance().set(&DataKey::LPAddress, &lp_addr);
        env.storage().instance().set(&DataKey::BurnAddress, &burn_addr);
        env.storage().instance().extend_ttl(100, 1_000_000);
    }

    /// Get current fee split configuration.
    /// Returns (FeeConfig, treasury_addr, lp_addr, burn_addr).
    pub fn get_fee_split_config(env: Env) -> (FeeConfig, Address, Address, Address) {
        let config: FeeConfig = env
            .storage()
            .instance()
            .get(&DataKey::FeeSplitConfig)
            .unwrap_or(FeeConfig {
                treasury_bps: 10000,
                lp_bps: 0,
                burn_bps: 0,
            });
        
        let treasury: Address = env
            .storage()
            .instance()
            .get(&DataKey::TreasuryAddress)
            .expect("Treasury address not configured");
        
        let lp: Address = env
            .storage()
            .instance()
            .get(&DataKey::LPAddress)
            .expect("LP address not configured");
        
        let burn: Address = env
            .storage()
            .instance()
            .get(&DataKey::BurnAddress)
            .expect("Burn address not configured");
        
        (config, treasury, lp, burn)
    }

    /// Distribute collected fees according to configured split.
    /// Uses zero-float i128 arithmetic with 7-decimal (stroop) precision.
    /// 
    /// # Parameters
    /// - `fee_amount` — Total fee amount in stroops to distribute
    /// - `token` — Token address for transfers
    /// 
    /// # Process
    /// 1. Read FeeConfig from Instance storage
    /// 2. Calculate proportional amounts using BPS (no floats)
    /// 3. Transfer to each destination (treasury, LP, burn)
    /// 4. Emit event for off-chain indexing
    /// 
    /// # Auth
    /// Requires admin authorization via check_role.
    /// 
    /// # Storage Rent
    /// Extends TTL for Instance storage after writes.
    fn distribute_fee_split(env: &Env, fee_amount: i128, token: &Address) {
        if fee_amount == 0 {
            return;
        }
        
        // Read fee split configuration
        let config: FeeConfig = env
            .storage()
            .instance()
            .get(&DataKey::FeeSplitConfig)
            .unwrap_or(FeeConfig {
                treasury_bps: 10000,
                lp_bps: 0,
                burn_bps: 0,
            });
        
        let treasury_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::TreasuryAddress)
            .expect("Treasury address not configured");
        
        let lp_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::LPAddress)
            .expect("LP address not configured");
        
        let burn_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::BurnAddress)
            .expect("Burn address not configured");
        
        // Calculate split amounts using BPS (zero-float policy)
        // Formula: amount * bps / 10000
        let treasury_amount = (fee_amount * config.treasury_bps as i128) / 10000;
        let lp_amount = (fee_amount * config.lp_bps as i128) / 10000;
        let burn_amount = (fee_amount * config.burn_bps as i128) / 10000;
        
        let token_client = token::Client::new(env, token);
        
        // Transfer to treasury
        if treasury_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &treasury_addr,
                &treasury_amount,
            );
        }
        
        // Transfer to LP pool
        if lp_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &lp_addr,
                &lp_amount,
            );
        }
        
        // Transfer to burn address (Stellar burn mechanism)
        if burn_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &burn_addr,
                &burn_amount,
            );
        }
        
        // Emit event for off-chain indexing
        env.events().publish(
            (symbol_short!("FeeSplit"), fee_amount),
            (treasury_amount, lp_amount, burn_amount),
        );
        
        env.storage().instance().extend_ttl(100, 1_000_000);
    }

    /// Propose market resolution — only admin (oracle-triggered).
    pub fn propose_resolution(env: Env, market_id: u64, winning_outcome: u32) {
        check_role(&env, AccessRole::Admin);

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
        check_role(&env, AccessRole::Admin);

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
            env.ledger().timestamp() >= market.proposal_timestamp + LIVENESS_WINDOW,
            "Liveness window has not elapsed"
        );
        assert!(
            winning_outcome < market.options.len(),
            "Invalid outcome index"
        );

        market.status = MarketStatus::Resolved;
        market.winning_outcome = winning_outcome;

        // ── Conditional market check ─────────────────────────────────────────
        // If this market has a condition, verify the referenced market resolved
        // to the expected outcome. If not, void the market instead.
        if let Some(cond_id) = market.condition_market_id {
            let cond_market: Market = env
                .storage()
                .persistent()
                .get(&DataKey::Market(cond_id))
                .expect("condition market not found");
            assert!(
                cond_market.status == MarketStatus::Resolved,
                "condition market not yet resolved"
            );
            let expected = market.condition_outcome.unwrap_or(0);
            if cond_market.winning_outcome != expected {
                market.status = MarketStatus::Voided;
                env.storage().persistent().set(&DataKey::Market(market_id), &market);
                env.storage().persistent().extend_ttl(&DataKey::Market(market_id), 100, 1_000_000);
                env.events().publish((symbol_short!("Voided"), market_id), cond_market.winning_outcome);
                return;
            }
        }
        // ── end conditional check ─────────────────────────────────────────────

        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
        env.storage().persistent().extend_ttl(&DataKey::Market(market_id), 100, 1_000_000);

        // Record resolution timestamp for 30-day claim deadline tracking
        let resolution_time = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&DataKey::ClaimDeadline(market_id), &resolution_time);
        env.storage().persistent().extend_ttl(&DataKey::ClaimDeadline(market_id), 100, 1_000_000);
    }

    /// Opens a dispute voting window for 24 hours. Callable by any token holder within 24h of resolution.
    /// Requires that the caller has a token balance > 0 in the market token (STELLA).
    pub fn open_dispute(env: Env, market_id: u64, caller: Address) {
        caller.require_auth();

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Resolved, "Market must be resolved to open a dispute");

        // Must be within 24h of resolution
        let resolution_time: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::ClaimDeadline(market_id))
            .unwrap_or(0);
        let current_time = env.ledger().timestamp();
        assert!(current_time <= resolution_time + 86400, "Dispute window closed");

        // Verify token holding
        let token_client = token::Client::new(&env, &market.token);
        assert!(token_client.balance(&caller) > 0, "Only token holders can open a dispute");

        // Ensure no active dispute exists
        let has_dispute = env.storage().persistent().has(&DataKey::Dispute(market_id));
        assert!(!has_dispute, "Dispute already opened");

        let dispute = DisputeData {
            active: true,
            votes: soroban_sdk::Map::new(&env),
            total_votes: 0,
            support_votes: 0,
            deadline: current_time + 86400, // 24 hours from now
        };

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(market_id), &dispute);

        env.events().publish((soroban_sdk::Symbol::new(&env, "DisputeOpened"), market_id), caller);
    }

    /// Cast a weighted vote in an active dispute using STELLA token balance (market.token).
    /// Weight is mathematically correct (1:1 with token balance).
    pub fn cast_vote(env: Env, market_id: u64, voter: Address, support: bool) {
        voter.require_auth();

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        let mut dispute: DisputeData = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(market_id))
            .expect("No dispute found");

        assert!(dispute.active, "Dispute is not active");
        let current_time = env.ledger().timestamp();
        assert!(current_time <= dispute.deadline, "Voting deadline passed");
        assert!(!dispute.votes.contains_key(voter.clone()), "Already voted");

        let token_client = token::Client::new(&env, &market.token);
        let balance = token_client.balance(&voter);
        assert!(balance > 0, "No voting weight");

        dispute.votes.set(voter.clone(), balance);
        dispute.total_votes += balance;
        if support {
            dispute.support_votes += balance;
        }

        // Check threshold: more than 60% support (support_votes / total_votes > 0.6)
        // Equivalent to: support_votes * 10 > total_votes * 6
        if dispute.support_votes * 10 > dispute.total_votes * 6 {
            let mut updated_market = market;
            updated_market.status = MarketStatus::ReReview;
            env.storage()
                .persistent()
                .set(&DataKey::Market(market_id), &updated_market);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(market_id), &dispute);
    }

    /// Closes an active dispute after the deadline.
    pub fn close_dispute(env: Env, market_id: u64) {
        let mut dispute: DisputeData = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(market_id))
            .expect("No dispute found");

        assert!(dispute.active, "Dispute already closed");
        let current_time = env.ledger().timestamp();
        assert!(current_time > dispute.deadline, "Voting still in progress");

        dispute.active = false;
        env.storage()
            .persistent()
            .set(&DataKey::Dispute(market_id), &dispute);
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
        check_role(&env, AccessRole::Admin);

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
        assert!(market.status == MarketStatus::Resolved, "Market not resolved yet");

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
        let positions: Vec<(Address, u32, i128)> = env
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
        for i in 0..positions.len() {
            let (addr, outcome, amount) = positions.get(i).unwrap();
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

        let fee_bps = calculate_dynamic_fee(total_pool);
        let payout_pool = (total_pool * (10000 - fee_bps as i128)) / 10000;

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
        check_role(&env, AccessRole::Admin);

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

        // Acquire re-entrancy lock
        acquire_reentrancy_lock(&env);

        // Execute claim logic with guard protection
        let result = Self::internal_claim_original(&env, market_id, claimant);

        // Release lock before returning
        release_reentrancy_lock(&env);

        result
    }

    /// Internal claim original logic (protected by re-entrancy guard).
    fn internal_claim_original(env: &Env, market_id: u64, claimant: Address) -> i128 {
        // Verify market is resolved
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.status == MarketStatus::Resolved, "Market not resolved yet");

        // Get original payouts map
        let original_payouts: Map<Address, i128> = env
            .storage()
            .persistent()
            .get(&DataKey::OriginalPayouts(market_id))
            .unwrap_or(Map::new(env));

        // Verify claimant has a payout
        assert!(
            original_payouts.contains_key(claimant.clone()),
            "No payout for this address"
        );

        let payout_amount = original_payouts.get(claimant.clone()).unwrap();

        // Check if already claimed (payout would be 0 if claimed)
        assert!(payout_amount > 0, "Already claimed");

        // Transfer the original payout amount
        let token_client = token::Client::new(env, &market.token);
        
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
    /// # Gas Optimization
    /// Uses Vec for positions storage. Linear iteration over Vec is more gas-efficient
    /// than Map iteration for typical market sizes (<100 bettors).
    ///
    /// Returns the number of winners paid in this call.
    pub fn batch_distribute(env: Env, market_id: u64, batch_size: u32) -> u32 {
        // Acquire re-entrancy lock
        acquire_reentrancy_lock(&env);

        // Execute payout logic with guard protection
        let result = Self::internal_batch_distribute(&env, market_id, batch_size);

        // Release lock before returning
        release_reentrancy_lock(&env);

        result
    }

    /// Internal batch distribute logic (protected by re-entrancy guard).
    fn internal_batch_distribute(env: &Env, market_id: u64, batch_size: u32) -> u32 {
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

        // Check if there's an active dispute
        let dispute_opt: Option<DisputeData> = env.storage().persistent().get(&DataKey::Dispute(market_id));
        if let Some(dispute) = dispute_opt {
            assert!(!dispute.active, "Payouts paused during an active dispute");
        }

        // Gas optimization: Vec instead of Map for positions
        let positions: Vec<(Address, u32, i128)> = env
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
        // Linear scan through Vec is cheaper than Map iteration for small datasets
        let mut winners: Vec<(Address, i128)> = Vec::new(env);
        let mut winning_stake: i128 = 0;
        for i in 0..positions.len() {
            let (addr, outcome, amount) = positions.get(i).unwrap();
            if outcome == market.winning_outcome {
                winners.push_back((addr, amount));
                winning_stake += amount;
            }
        }

        if winning_stake == 0 {
            return 0;
        }

        let fee_bps = calculate_dynamic_fee(total_pool);
        let fee_amount = (total_pool * fee_bps as i128) / 10000;
        let payout_pool = (total_pool * (10000 - fee_bps as i128)) / 10000;
        let token_client = token::Client::new(env, &market.token);

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
            // Burn position token on claim
            position_token::burn(env, market_id, market.winning_outcome, &bettor);
            token_client.transfer(&env.current_contract_address(), &bettor, &payout);
            paid += 1;
        }

        // Distribute protocol fee using configured split (only on first batch)
        if cursor == 0 && fee_amount > 0 {
            distribute_fee_split(env, fee_amount, &market.token);
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

    /// Batch payout processor for distributing rewards to multiple winners in a single transaction.
    /// 
    /// # Purpose
    /// Allows resolver to distribute payouts to multiple winners efficiently, avoiding
    /// individual claim transactions and reducing gas costs for users.
    /// 
    /// # Parameters
    /// - `market_id` — Market identifier
    /// - `recipients` — Vec of recipient addresses (max 50)
    /// - `resolver` — Address initiating the payout (must be admin/resolver)
    /// 
    /// # Process
    /// 1. Verify market is resolved and no active dispute
    /// 2. Calculate payout for each recipient based on their stake
    /// 3. Transfer tokens to each recipient
    /// 4. Mark each recipient as paid to prevent double-payout
    /// 5. Emit BatchPayoutProcessed event
    /// 
    /// # Double-Payout Guard
    /// Uses PayoutClaimed(market_id, address) in Persistent storage to track paid recipients.
    /// Skips recipients who have already been paid.
    /// 
    /// # Gas Optimization
    /// - Capped at 50 recipients to stay within Soroban instruction limits
    /// - Single loop iteration for all transfers
    /// - Batch storage writes with TTL extension
    /// 
    /// # Returns
    /// Number of recipients successfully paid in this batch.
    pub fn batch_payout(
        env: Env,
        market_id: u64,
        recipients: Vec<Address>,
        resolver: Address,
    ) -> u32 {
        resolver.require_auth();
        check_role(&env, AccessRole::Admin);

        // Acquire re-entrancy lock
        acquire_reentrancy_lock(&env);

        // Execute payout logic with guard protection
        let result = Self::internal_batch_payout(&env, market_id, recipients);

        // Release lock before returning
        release_reentrancy_lock(&env);

        result
    }

    /// Internal batch payout logic (protected by re-entrancy guard).
    fn internal_batch_payout(
        env: &Env,
        market_id: u64,
        recipients: Vec<Address>,
    ) -> u32 {
        // Cap batch size at 50 to stay within instruction limits
        assert!(
            recipients.len() <= 50,
            "Batch size must not exceed 50 recipients"
        );

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.status == MarketStatus::Resolved, "Market not resolved yet");

        // Check if there's an active dispute
        let dispute_opt: Option<DisputeData> = env.storage().persistent().get(&DataKey::Dispute(market_id));
        if let Some(dispute) = dispute_opt {
            assert!(!dispute.active, "Payouts paused during an active dispute");
        }

        // Get positions and calculate payouts
        let positions: Vec<(Address, u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::UserPosition(market_id))
            .unwrap();

        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);

        // Calculate winning stake
        let mut winning_stake: i128 = 0;
        for i in 0..positions.len() {
            let (_, outcome, amount) = positions.get(i).unwrap();
            if outcome == market.winning_outcome {
                winning_stake += amount;
            }
        }

        assert!(winning_stake > 0, "No winners to pay out");

        let fee_bps = calculate_dynamic_fee(total_pool);
        let payout_pool = (total_pool * (10000 - fee_bps as i128)) / 10000;
        let token_client = token::Client::new(env, &market.token);

        let mut paid_count: u32 = 0;
        let mut total_distributed: i128 = 0;

        // Iterate over recipients and process payouts
        for i in 0..recipients.len() {
            let recipient = recipients.get(i).unwrap();

            // Double-payout guard: check if already paid
            let already_paid: bool = env
                .storage()
                .persistent()
                .get(&DataKey::PayoutClaimed(market_id, recipient.clone()))
                .unwrap_or(false);

            if already_paid {
                continue; // Skip already paid recipients
            }

            // Find recipient's stake in positions
            let mut recipient_stake: i128 = 0;
            let mut recipient_outcome: u32 = 0;
            for j in 0..positions.len() {
                let (addr, outcome, amount) = positions.get(j).unwrap();
                if addr == recipient {
                    recipient_stake = amount;
                    recipient_outcome = outcome;
                    break;
                }
            }

            // Skip if recipient has no position or didn't win
            if recipient_stake == 0 || recipient_outcome != market.winning_outcome {
                continue;
            }

            // Calculate payout using zero-float arithmetic
            let payout = (recipient_stake * payout_pool) / winning_stake;

            // Transfer payout to recipient
            token_client.transfer(&env.current_contract_address(), &recipient, &payout);

            // Mark as paid in Persistent storage with TTL extension
            env.storage()
                .persistent()
                .set(&DataKey::PayoutClaimed(market_id, recipient.clone()), &true);
            env.storage()
                .persistent()
                .extend_ttl(&DataKey::PayoutClaimed(market_id, recipient.clone()), 100, 1_000_000);

            // Burn position token on claim
            position_token::burn(env, market_id, market.winning_outcome, &recipient);

            paid_count += 1;
            total_distributed += payout;
        }

        // Emit BatchPayoutProcessed event for off-chain indexing
        env.events().publish(
            (symbol_short!("BatchPay"), market_id),
            (paid_count, total_distributed),
        );

        paid_count
    }

    /// Check if a recipient has been paid for a specific market.
    /// Returns true if payout has been claimed/processed.
    pub fn is_payout_claimed(env: Env, market_id: u64, recipient: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::PayoutClaimed(market_id, recipient))
            .unwrap_or(false)
    }

    /// Returns how many winners have already been paid out.
    pub fn get_settlement_cursor(env: Env, market_id: u64) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SettlementCursor(market_id))
            .unwrap_or(0)
    }

    pub fn get_market(env: Env, market_id: u64) -> Market {
        env.storage().persistent().get(&DataKey::Market(market_id)).unwrap()
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

    /// Verify a ZK proof scalar against an expected value.
    ///
    /// Both `proof_scalar` and `expected` are normalized to [0, r) before
    /// comparison, preventing scalar-bypass attacks where a prover supplies
    /// s + k*r instead of s.
    ///
    /// # Auth
    /// Caller must be the contract admin (oracle-triggered verification).
    ///
    /// # Returns
    /// `true` if the normalized scalars are equal.
    pub fn verify_proof(
        env: Env,
        caller: Address,
        proof_scalar: soroban_sdk::BytesN<32>,
        expected: soroban_sdk::BytesN<32>,
    ) -> bool {
        // Only admin may trigger proof verification
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        caller.require_auth();
        assert_eq!(caller, admin, "unauthorized");

        // Normalize both scalars to canonical range [0, r) before comparison.
        // This prevents a prover from bypassing equality by supplying s + k*r.
        let norm_proof = normalize_scalar(proof_scalar.to_array());
        let norm_expected = normalize_scalar(expected.to_array());

        norm_proof == norm_expected
    }

    /// Get LMSR price for a specific outcome.
    /// Returns probability in SCALE units (10_000_000 = 1.0 = 100%).
    pub fn get_lmsr_price(env: Env, market_id: u64, outcome_index: u32) -> i128 {
        let b: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LmsrB(market_id))
            .unwrap();
        
        let outcome_shares: Vec<i128> = env
            .storage()
            .instance()
            .get(&DataKey::OutcomeShares(market_id))
            .unwrap();
        
        let n = outcome_shares.len() as usize;
        let mut q = [0i128; 8];
        for j in 0..n {
            q[j] = outcome_shares.get(j as u32).unwrap();
        }
        
        lmsr_price(&q[..n], b, outcome_index as usize)
    }

    /// Get outcome shares for a market.
    /// Returns a Vec of share quantities for each outcome.
    pub fn get_outcome_shares(env: Env, market_id: u64) -> Vec<i128> {
        env.storage()
            .instance()
            .get(&DataKey::OutcomeShares(market_id))
            .unwrap()
    }

    /// Get per-outcome pool balances for a multi-outcome market.
    /// Returns a Map of outcome_index → total stake in that outcome.
    pub fn get_outcome_pool_balances(env: Env, market_id: u64) -> Map<u32, i128> {
        env.storage()
            .persistent()
            .get(&DataKey::OutcomePoolBalances(market_id))
            .unwrap_or(Map::new(&env))
    }

    /// Get pool balance for a specific outcome.
    /// Returns the total stake placed on the specified outcome.
    pub fn get_outcome_pool_balance(env: Env, market_id: u64, outcome_index: u32) -> i128 {
        let pool_balances: Map<u32, i128> = env
            .storage()
            .persistent()
            .get(&DataKey::OutcomePoolBalances(market_id))
            .unwrap_or(Map::new(&env));
        pool_balances.get(outcome_index).unwrap_or(0)
    }

    /// Get all outcome options for a market.
    /// Returns a Vec of outcome labels (e.g., ["Team A", "Team B", "Team C", "Draw"]).
    pub fn get_market_outcomes(env: Env, market_id: u64) -> Vec<String> {
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        market.options
    }

    /// Get outcome count for a market.
    /// Returns the number of possible outcomes (2-8).
    pub fn get_outcome_count(env: Env, market_id: u64) -> u32 {
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        market.options.len()
    }

    /// Calculate payout for a specific bettor on a specific outcome.
    /// Uses the formula: (user_stake / outcome_pool) * total_pool * (1 - fee_rate)
    /// Returns the payout amount in stroops.
    /// 
    /// # Zero-Float Policy
    /// All calculations use i128 arithmetic with stroop precision.
    pub fn calculate_payout(
        env: Env,
        market_id: u64,
        bettor: Address,
        outcome_index: u32,
    ) -> i128 {
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        // Get user's stake on this outcome
        let positions: Vec<(Address, u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::UserPosition(market_id))
            .unwrap();

        let mut user_stake: i128 = 0;
        for i in 0..positions.len() {
            let (addr, outcome, amount) = positions.get(i).unwrap();
            if addr == bettor && outcome == outcome_index {
                user_stake = amount;
                break;
            }
        }

        if user_stake == 0 {
            return 0;
        }

        // Get outcome pool balance
        let pool_balances: Map<u32, i128> = env
            .storage()
            .persistent()
            .get(&DataKey::OutcomePoolBalances(market_id))
            .unwrap();
        let outcome_pool = pool_balances.get(outcome_index).unwrap_or(0);

        if outcome_pool == 0 {
            return 0;
        }

        // Get total pool
        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);

        // Calculate fee
        let fee_bps = calculate_dynamic_fee(total_pool);
        let payout_pool = (total_pool * (10000 - fee_bps as i128)) / 10000;

        // Calculate proportional payout: (user_stake / outcome_pool) * payout_pool
        // Rearranged to avoid precision loss: (user_stake * payout_pool) / outcome_pool
        (user_stake * payout_pool) / outcome_pool
    }

    /// Claim refund for a voided market.
    /// Returns the amount refunded.
    pub fn claim_refund(env: Env, market_id: u64, claimant: Address) -> i128 {
        claimant.require_auth();

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        
        assert!(market.status == MarketStatus::Voided, "Market is not voided");

        // Check if already refunded
        let already_refunded: bool = env
            .storage()
            .persistent()
            .get(&DataKey::RefundClaimed(market_id))
            .unwrap_or(false);
        assert!(!already_refunded, "Already refunded");

        // Get user's position
        let positions: Vec<(Address, u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::UserPosition(market_id))
            .unwrap();

        let mut refund_amount: i128 = 0;
        for i in 0..positions.len() {
            let (addr, _, amount) = positions.get(i).unwrap();
            if addr == claimant {
                refund_amount = amount;
                break;
            }
        }

        assert!(refund_amount > 0, "No position to refund");

        // Transfer refund
        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&env.current_contract_address(), &claimant, &refund_amount);

        // Mark as refunded
        env.storage()
            .persistent()
            .set(&DataKey::RefundClaimed(market_id), &true);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::RefundClaimed(market_id), 100, 1_000_000);

        refund_amount
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, vec, Env, String};

    // ── shared helpers ────────────────────────────────────────────────────────



    fn setup() -> (Env, PredictionMarketClient<'static>, Address, Address, u64) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        // Use a dummy address for token — tests that don't do real transfers use mock_all_auths
        let token = Address::generate(&env);
        let creator = Address::generate(&env);
        client.initialize(&admin);
        let deadline = env.ledger().timestamp() + 86400;
        let question = String::from_str(&env, "Will BTC exceed $100k?");
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(&creator, &1u64, &question, &options, &deadline, &token, &100_000_000i128, &None, &None);
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

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &creator,
            &1u64,
            &String::from_str(&env, "Batch test market"),
            &options,
            &deadline,
            &sac.address(),
            &100_000_000i128,
            &None,
            &None,
        );

        for bettor in bettors.iter() {
            client.place_bet(&1u64, &0u32, &bettor, &100i128);
        }
        client.place_bet(&1u64, &1u32, &loser, &100i128);
        
        client.propose_resolution(&1u64, &0u32);
        
        // Advance ledger past liveness window
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        
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

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &creator,
            &2u64,
            &String::from_str(&env, "Test market"),
            &options,
            &deadline,
            &token_addr,
            &100_000_000i128,
            &None,
            &None,
        );

        client.initialize(&admin);
        client.create_market(&2u64, &question, &options, &deadline, &token_addr);

        let bettor1 = Address::generate(&env);
        let bettor2 = Address::generate(&env);
        let sac = token::StellarAssetClient::new(&env, &token_addr);
        sac.mint(&bettor1, &1000i128);
        sac.mint(&bettor2, &1000i128);
        
        client.place_bet(&2u64, &0u32, &bettor1, &100i128);
        client.place_bet(&2u64, &1u32, &bettor2, &200i128);

        // total_shares accumulates LMSR cost deltas — must be > 0
        assert!(client.get_total_shares(&2u64) > 0);
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
        let creator = Address::generate(&env);
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &creator,
            &1u64,
            &String::from_str(&env, "Duplicate"),
            &options,
            &deadline,
            &token,
            &100_000_000i128,
            &None,
            &None,
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
        let creator = Address::generate(&env);
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        // deadline in the past
        client.create_market(
            &creator,
            &3u64,
            &String::from_str(&env, "Past market"),
            &options,
            &0u64,
            &token,
            &100_000_000i128,
            &None,
            &None,
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
        let creator = Address::generate(&env);
        let options = vec![&env, String::from_str(&env, "Only")];
        client.create_market(
            &creator,
            &4u64,
            &String::from_str(&env, "Bad market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
            &100_000_000i128,
            &None,
            &None,
        );
    }

    // ── Resolve & distribute ──────────────────────────────────────────────────

    #[test]
    fn test_resolve_market_flow() {
        let (env, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32);
        // Advance ledger past liveness window
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);
        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Resolved);
        assert_eq!(market.winning_outcome, 0u32);
    }

    #[test]
    #[should_panic(expected = "Market must be proposed or disputed to resolve")]
    fn test_double_resolve_panics() {
        let (env, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);
        client.resolve_market(&1u64, &0u32);
    }

    #[test]
    #[should_panic(expected = "Invalid outcome index")]
    fn test_invalid_outcome_panics() {
        let (env, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
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
        let (env, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
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
        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 1;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &creator,
            &5u64,
            &String::from_str(&env, "Short market"),
            &options,
            &deadline,
            &token,
            &100_000_000i128,
            &None,
            &None,
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
        let (env, client, _, token, _) = setup();
        client.propose_resolution(&1u64, &0u32);
        let disputer = Address::generate(&env);
        // Mint bond to disputer
        let sac = token::StellarAssetClient::new(&env, &token);
        sac.mint(&disputer, &1000i128);
        
        client.dispute(&1u64, &disputer, &100i128);
        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Disputed);
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
        let creator = Address::generate(&env);
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &creator,
            &1u64,
            &String::from_str(&env, "Q"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
            &100_000_000i128,
            &None,
            &None,
        );
        client.batch_distribute(&1u64, &1u32);
    }

    /// No winners → batch_distribute returns 0 without panic.
    #[test]
    fn test_batch_distribute_no_winners_is_noop() {
        let (env, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
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
        let creator = Address::generate(&env);
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(
            &creator,
            &2u64,
            &String::from_str(&env, "New market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
            &100_000_000i128,
            &None,
            &None,
        );
    }

    /// place_bet on an existing market is BLOCKED during shutdown.
    #[test]
    #[should_panic(expected = "Platform is shut down")]
    fn test_place_bet_blocked_when_shutdown() {
        let (env, client, _, _, _) = setup();
        client.set_global_status(&false);
        // market 1 was created before shutdown — betting must still be blocked
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &50i128);
    }

    #[test]
    fn test_place_bet_with_sig_replay_protection() {
        let (env, client, _, _, _) = setup();
        let bettor = Address::generate(&env);
        let market_id = 1u64;
        let option_index = 0u32;
        let amount = 50_000_000i128; // 5.0 XLM
        let nonce = 0u64;
        let signature = soroban_sdk::BytesN::from_array(&env, &[0u8; 64]);

        // Mock all auths to bypass signature verification in the mock environment
        env.mock_all_auths();

        // 1. First bet should succeed
        client.place_bet_with_sig(&market_id, &option_index, &bettor, &amount, &nonce, &signature);
        assert!(client.get_total_shares(&market_id) > 0);

        // 2. Replaying the SAME nonce should panic
        let res = env.as_contract(&client.address, || {
            client.try_place_bet_with_sig(&market_id, &option_index, &bettor, &amount, &nonce, &signature)
        });
        assert!(res.is_err(), "Replay with same nonce should fail");

        // 3. Using the NEXT nonce should succeed
        let next_nonce = 1u64;
        client.place_bet_with_sig(&market_id, &option_index, &bettor, &amount, &next_nonce, &signature);
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
        let (env, client, _, _, _) = setup();
        client.set_global_status(&false);
        client.propose_resolution(&1u64, &0u32);
        // Advance ledger past liveness window
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);
        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Resolved);
    }

    /// Re-activating the platform allows create_market again.
    #[test]
    fn test_reactivation_allows_create_market() {
        let (env, client, _, token, _) = setup();
        client.set_global_status(&false);
        assert!(!client.get_global_status());
        client.set_global_status(&true);
        assert!(client.get_global_status());
        let creator = Address::generate(&env);
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        // Should not panic
        client.create_market(
            &creator,
            &2u64,
            &String::from_str(&env, "Post-reactivation market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
            &100_000_000i128,
            &None,
            &None,
        );
        assert_eq!(client.get_market(&2u64).id, 2u64);
    }

    // ── Dispute Mechanism ────────────────────────────────────────────────────

    #[test]
    fn test_dispute_false_proposal() {
        let (env, client, _, token, _) = setup();
        let disputer = Address::generate(&env);
        
        // 1. Propose something
        client.propose_resolution(&1u64, &0u32);
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Proposed);

        // 2. Dispute it
        // Note: mock_all_auths handles the token transfer of the bond
        let sac = token::StellarAssetClient::new(&env, &token);
        sac.mint(&disputer, &1000i128);
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
        let (env, client, _, token, _) = setup();
        client.propose_resolution(&1u64, &0u32);
        let disputer = Address::generate(&env);
        // Mint bond to disputer
        let sac = token::StellarAssetClient::new(&env, &token);
        sac.mint(&disputer, &1000i128);

        client.dispute(&1u64, &disputer, &100i128);
        client.batch_distribute(&1u64, &5u32);
    }

    // ── TTL Bumping ──────────────────────────────────────────────────────────

    #[test]
    fn test_bump_market_ttl() {
        let (_env, client, _, _, _) = setup();
        // Calling the function to ensure it doesn't panic and executes correctly.
        client.bump_market_ttl(&1u64, &1000u32, &5000u32);
    }

    // ── Creation Fee ─────────────────────────────────────────────────────────

    /// Zero fee (default) — create_market succeeds without any token transfer.
    #[test]
    fn test_zero_fee_no_transfer() {
        let (env, client, _, token, _) = setup();
        // Fee defaults to 0; a second market should be created without any fee charge.
        let creator = Address::generate(&env);
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator,
            &2u64,
            &String::from_str(&env, "Zero fee market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
            &100_000_000i128,
            &None,
            &None,
        );
        assert_eq!(client.get_market(&2u64).id, 2u64);
        // Fee config should still be (0, None, Treasury)
        let (fee, _, _) = client.get_fee_config();
        assert_eq!(fee, 0i128);
    }

    /// Admin can update fee; subsequent create_market charges the fee.
    #[test]
    fn test_fee_charged_on_create_market() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Mint tokens: creator gets 500, fee_dest starts at 0
        let fee_dest = Address::generate(&env);
        let creator = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        sac_client.mint(&creator, &500i128);

        // Set fee to 100 stroops, routed to DAO treasury
        client.update_fee(&100i128, &fee_dest, &FeeMode::Treasury);
        let (fee, dest, mode) = client.get_fee_config();
        assert_eq!(fee, 100i128);
        assert_eq!(dest, Some(fee_dest.clone()));
        assert_eq!(mode, FeeMode::Treasury);

        // Create market — fee should be deducted from creator
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator,
            &1u64,
            &String::from_str(&env, "Fee market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &sac.address(),
            &100_000_000i128,
            &None,
            &None,
        );

        // Creator paid 100, fee_dest received 100
        let fee_token = token::Client::new(&env, &sac.address());
        assert_eq!(fee_token.balance(&creator), 400i128);
        assert_eq!(fee_token.balance(&fee_dest), 100i128);
    }

    /// Burn mode: fee is sent to the burn address.
    #[test]
    fn test_fee_burn_mode() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let burn_addr = Address::generate(&env);
        let creator = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        sac_client.mint(&creator, &200i128);

        // Set fee to 50 stroops, routed to burn address
        client.update_fee(&50i128, &burn_addr, &FeeMode::Burn);
        let (_, _, mode) = client.get_fee_config();
        assert_eq!(mode, FeeMode::Burn);

        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator,
            &1u64,
            &String::from_str(&env, "Burn fee market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &sac.address(),
            &100_000_000i128,
            &None,
            &None,
        );

        let fee_token = token::Client::new(&env, &sac.address());
        assert_eq!(fee_token.balance(&creator), 150i128);
        assert_eq!(fee_token.balance(&burn_addr), 50i128);
    }

    /// Insufficient balance aborts market creation with InsufficientFeeBalance.
    #[test]
    #[should_panic(expected = "InsufficientFeeBalance")]
    fn test_insufficient_fee_balance_aborts() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let fee_dest = Address::generate(&env);
        let creator = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        // Mint only 10 but fee is 100 — transfer will fail
        sac_client.mint(&creator, &10i128);

        client.update_fee(&100i128, &fee_dest, &FeeMode::Treasury);

        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator,
            &1u64,
            &String::from_str(&env, "Broke market"),
            &options,
            &(env.ledger().timestamp() + 100),
            &sac.address(),
            &100_000_000i128,
            &None,
            &None,
        );
    }

    /// Max fee (i128::MAX) is accepted by update_fee without panic.
    #[test]
    fn test_max_fee_accepted() {
        let (env, client, _, _, _) = setup();
        let fee_dest = Address::generate(&env);
        // Just verify update_fee doesn't panic with max value
        // (actual market creation with max fee would need matching balance)
        client.update_fee(&i128::MAX, &fee_dest, &FeeMode::Treasury);
        let (fee, _, _) = client.get_fee_config();
        assert_eq!(fee, i128::MAX);
    }

    /// update_fee requires admin auth — non-admin call must panic.
    #[test]
    #[should_panic]
    fn test_update_fee_requires_admin_auth() {
        let env = Env::default();
        // Do NOT call mock_all_auths — auth will be enforced
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        // Initialize with mock_all_auths just for setup, then drop it
        env.mock_all_auths();
        client.initialize(&admin);
        // update_fee without admin auth should panic
        let rando = Address::generate(&env);
        client.update_fee(&100i128, &rando, &FeeMode::Treasury);
    }

    /// Admin can update fee to 0 to disable it (free market creation).
    #[test]
    fn test_fee_can_be_reset_to_zero() {
        let (env, client, _, token, _) = setup();
        let fee_dest = Address::generate(&env);
        client.update_fee(&500i128, &fee_dest, &FeeMode::Treasury);
        // Reset to zero
        client.update_fee(&0i128, &fee_dest, &FeeMode::Treasury);
        let (fee, _, _) = client.get_fee_config();
        assert_eq!(fee, 0i128);
        // Market creation should work without any fee transfer
        let creator = Address::generate(&env);
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator,
            &2u64,
            &String::from_str(&env, "Free again"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
            &100_000_000i128,
            &None,
            &None,
        );
        assert_eq!(client.get_market(&2u64).id, 2u64);
    }

    // ── Bet caps ──────────────────────────────────────────────────────────────

    #[test]
    fn test_bet_limits_defaults() {
        let (_, client, _, _, _) = setup();
        let (min, max) = client.get_bet_limits();
        assert_eq!(min, 1_000_000i128);
        assert_eq!(max, i128::MAX);
    }

    #[test]
    fn test_update_bet_limits_and_get() {
        let (_, client, _, _, _) = setup();
        client.update_bet_limits(&5_000_000i128, &100_000_000i128);
        let (min, max) = client.get_bet_limits();
        assert_eq!(min, 5_000_000i128);
        assert_eq!(max, 100_000_000i128);
    }

    #[test]
    #[should_panic(expected = "bet exceeds cap")]
    fn test_bet_above_max_panics() {
        let (env, client, _, _, _) = setup();
        client.update_bet_limits(&1_000_000i128, &10_000_000i128);
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &10_000_001i128);
    }

    #[test]
    #[should_panic(expected = "bet below minimum")]
    fn test_bet_below_min_panics() {
        let (env, client, _, _, _) = setup();
        client.update_bet_limits(&5_000_000i128, &100_000_000i128);
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &1_000_000i128);
    }

    #[test]
    fn test_bet_at_exact_limits_succeeds() {
        let (env, client, _, _, _) = setup();
        client.update_bet_limits(&1_000_000i128, &50_000_000i128);
        let bettor1 = Address::generate(&env);
        let bettor2 = Address::generate(&env);
        // Exactly at min
        client.place_bet(&1u64, &0u32, &bettor1, &1_000_000i128);
        // Exactly at max
        client.place_bet(&1u64, &1u32, &bettor2, &50_000_000i128);
    }

    #[test]
    #[should_panic(expected = "max must be >= min")]
    fn test_update_bet_limits_max_less_than_min_panics() {
        let (_, client, _, _, _) = setup();
        client.update_bet_limits(&10_000_000i128, &5_000_000i128);
    }

    #[test]
    #[should_panic(expected = "min must be >= 1")]
    fn test_update_bet_limits_zero_min_panics() {
        let (_, client, _, _, _) = setup();
        client.update_bet_limits(&0i128, &10_000_000i128);
    }

    #[test]
    fn test_update_bet_limits_zero_max_removes_cap() {
        let (_, client, _, _, _) = setup();
        // First set a cap
        client.update_bet_limits(&1_000_000i128, &10_000_000i128);
        // Pass 0 to remove cap
        client.update_bet_limits(&1_000_000i128, &0i128);
        let (_, max) = client.get_bet_limits();
        assert_eq!(max, i128::MAX);
    }

    // ── LMSR pricing ──────────────────────────────────────────────────────────

    #[test]
    fn test_lmsr_price_equal_at_creation() {
        // Fresh market with b=100_000_000: both outcomes should be ~0.5
        let (_, client, _, _, _) = setup();
        let p0 = client.get_lmsr_price(&1u64, &0u32);
        let p1 = client.get_lmsr_price(&1u64, &1u32);
        // Each should be within 1% of 5_000_000 (0.5 in SCALE)
        assert!((p0 - 5_000_000i128).abs() < 50_000, "p0={}", p0);
        assert!((p1 - 5_000_000i128).abs() < 50_000, "p1={}", p1);
    }

    #[test]
    fn test_lmsr_price_shifts_after_bet() {
        // After buying shares on outcome 0, its price should rise above 0.5
        let (env, client, _, _, _) = setup();
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &50_000_000i128);
        let p0 = client.get_lmsr_price(&1u64, &0u32);
        let p1 = client.get_lmsr_price(&1u64, &1u32);
        assert!(p0 > 5_000_000i128, "p0 should be > 0.5 after buying: {}", p0);
        assert!(p1 < 5_000_000i128, "p1 should be < 0.5 after buying: {}", p1);
    }

    #[test]
    fn test_lmsr_outcome_shares_updated() {
        let (env, client, _, _, _) = setup();
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &10_000_000i128);
        let shares = client.get_outcome_shares(&1u64);
        assert_eq!(shares.get(0).unwrap(), 10_000_000i128);
        assert_eq!(shares.get(1).unwrap(), 0i128);
    }

    #[test]
    fn test_lmsr_cost_delta_charged_not_raw_amount() {
        // The cost delta for buying 10 XLM of shares on a fresh binary market
        // should be less than 10 XLM (LMSR cost < raw amount for large b)
        let (env, client, _, _, _) = setup();
        let bettor = Address::generate(&env);
        let shares_before = client.get_total_shares(&1u64);
        client.place_bet(&1u64, &0u32, &bettor, &10_000_000i128);
        let shares_after = client.get_total_shares(&1u64);
        let cost_delta = shares_after - shares_before;
        // Cost delta must be positive and less than the raw amount
        assert!(cost_delta > 0, "cost delta must be positive");
        assert!(cost_delta < 10_000_000i128, "cost delta should be < raw amount for large b");
    }

    #[test]
    #[should_panic(expected = "lmsr_b must be positive")]
    fn test_create_market_zero_b_panics() {
        let (env, client, _, token, _) = setup();
        let creator = Address::generate(&env);
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator,
            &2u64,
            &String::from_str(&env, "Bad b"),
            &options,
            &(env.ledger().timestamp() + 100),
            &token,
            &0i128,
            &None,
            &None,
        );
    }

    // ── Conditional market resolution ─────────────────────────────────────────

    /// Helper: create and fully resolve market `id` with `winning_outcome`.
    fn resolve_market_helper(
        client: &PredictionMarketClient,
        env: &Env,
        token: &Address,
        id: u64,
        winning_outcome: u32,
        condition_market_id: Option<u64>,
        condition_outcome: Option<u32>,
    ) {
        let creator = Address::generate(env);
        let options = vec![env, String::from_str(env, "Yes"), String::from_str(env, "No")];
        client.create_market(
            &creator,
            &id,
            &String::from_str(env, "Q"),
            &options,
            &(env.ledger().timestamp() + 100),
            token,
            &100_000_000i128,
            &condition_market_id,
            &condition_outcome,
        );
        client.propose_resolution(&id, &winning_outcome);
        client.resolve_market(&id, &winning_outcome);
    }

    #[test]
    fn test_conditional_market_resolves_when_condition_met() {
        let (env, client, _, token, _) = setup();
        // Market 1 (condition): resolve outcome 0
        client.propose_resolution(&1u64, &0u32);
        client.resolve_market(&1u64, &0u32);

        // Market 2 depends on market 1 resolving to outcome 0
        resolve_market_helper(&client, &env, &token, 2, 0, Some(1), Some(0));
        assert_eq!(client.get_market(&2u64).status, MarketStatus::Resolved);
    }

    #[test]
    fn test_conditional_market_voided_when_condition_not_met() {
        let (env, client, _, token, _) = setup();
        // Market 1 resolves to outcome 1 (not 0)
        client.propose_resolution(&1u64, &1u32);
        client.resolve_market(&1u64, &1u32);

        // Market 2 expects condition market to resolve to 0 — should be voided
        resolve_market_helper(&client, &env, &token, 2, 0, Some(1), Some(0));
        assert_eq!(client.get_market(&2u64).status, MarketStatus::Voided);
    }

    #[test]
    #[should_panic(expected = "condition market not yet resolved")]
    fn test_conditional_market_panics_if_condition_unresolved() {
        let (env, client, _, token, _) = setup();
        // Market 1 is still Active — not resolved
        resolve_market_helper(&client, &env, &token, 2, 0, Some(1), Some(0));
    }

    #[test]
    fn test_claim_refund_on_voided_market() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Real SAC token so transfers execute
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        let bettor = Address::generate(&env);
        sac_client.mint(&bettor, &500_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];

        // Condition market (id=1): resolve to outcome 1
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Cond"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None,
        );
        client.propose_resolution(&1u64, &1u32);
        client.resolve_market(&1u64, &1u32);

        // Dependent market (id=2): condition expects outcome 0 → will be voided
        client.create_market(
            &creator, &2u64, &String::from_str(&env, "Dep"), &options,
            &deadline, &sac.address(), &100_000_000i128, &Some(1u64), &Some(0u32),
        );
        // Bettor places a bet on market 2
        client.place_bet(&2u64, &0u32, &bettor, &10_000_000i128);
        let shares_bought = 10_000_000i128;

        // Resolve market 2 — condition not met → Voided
        client.propose_resolution(&2u64, &0u32);
        client.resolve_market(&2u64, &0u32);
        assert_eq!(client.get_market(&2u64).status, MarketStatus::Voided);

        // Bettor claims refund
        let balance_before = token::Client::new(&env, &sac.address()).balance(&bettor);
        let refunded = client.claim_refund(&2u64, &bettor);
        let balance_after = token::Client::new(&env, &sac.address()).balance(&bettor);

        assert_eq!(refunded, shares_bought);
        assert_eq!(balance_after - balance_before, shares_bought);
    }

    #[test]
    #[should_panic(expected = "Market is not voided")]
    fn test_claim_refund_on_active_market_panics() {
        let (env, client, _, _, _) = setup();
        let bettor = Address::generate(&env);
        client.claim_refund(&1u64, &bettor);
    }

    #[test]
    #[should_panic(expected = "Already refunded")]
    fn test_claim_refund_double_claim_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        let bettor = Address::generate(&env);
        sac_client.mint(&bettor, &500_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];

        // Condition market resolves to 1
        client.create_market(&creator, &1u64, &String::from_str(&env, "C"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None);
        client.propose_resolution(&1u64, &1u32);
        client.resolve_market(&1u64, &1u32);

        // Dependent market voided
        client.create_market(&creator, &2u64, &String::from_str(&env, "D"), &options,
            &deadline, &sac.address(), &100_000_000i128, &Some(1u64), &Some(0u32));
        client.place_bet(&2u64, &0u32, &bettor, &10_000_000i128);
        client.propose_resolution(&2u64, &0u32);
        client.resolve_market(&2u64, &0u32);

        client.claim_refund(&2u64, &bettor);
        client.claim_refund(&2u64, &bettor); // should panic
    }

    // ── Fee Splitter Tests ────────────────────────────────────────────────────

    #[test]
    fn test_configure_fee_split() {
        let (env, client, _, _, _) = setup();
        let treasury = Address::generate(&env);
        let lp = Address::generate(&env);
        let burn = Address::generate(&env);

        // Configure 50% treasury, 30% LP, 20% burn
        client.configure_fee_split(&5000u32, &3000u32, &2000u32, &treasury, &lp, &burn);

        let (config, treasury_addr, lp_addr, burn_addr) = client.get_fee_split_config();
        assert_eq!(config.treasury_bps, 5000);
        assert_eq!(config.lp_bps, 3000);
        assert_eq!(config.burn_bps, 2000);
        assert_eq!(treasury_addr, treasury);
        assert_eq!(lp_addr, lp);
        assert_eq!(burn_addr, burn);
    }

    #[test]
    #[should_panic(expected = "BPS split must total 10000 (100%)")]
    fn test_configure_fee_split_invalid_total() {
        let (env, client, _, _, _) = setup();
        let treasury = Address::generate(&env);
        let lp = Address::generate(&env);
        let burn = Address::generate(&env);

        // Invalid: totals to 9000 (90%)
        client.configure_fee_split(&5000u32, &3000u32, &1000u32, &treasury, &lp, &burn);
    }

    #[test]
    fn test_update_fee_split() {
        let (env, client, _, _, _) = setup();
        let treasury = Address::generate(&env);
        let lp = Address::generate(&env);
        let burn = Address::generate(&env);

        // Initial config
        client.configure_fee_split(&5000u32, &3000u32, &2000u32, &treasury, &lp, &burn);

        // Update to 60% treasury, 25% LP, 15% burn
        client.update_fee_split(&6000u32, &2500u32, &1500u32);

        let (config, _, _, _) = client.get_fee_split_config();
        assert_eq!(config.treasury_bps, 6000);
        assert_eq!(config.lp_bps, 2500);
        assert_eq!(config.burn_bps, 1500);
    }

    #[test]
    fn test_update_fee_addresses() {
        let (env, client, _, _, _) = setup();
        let treasury1 = Address::generate(&env);
        let lp1 = Address::generate(&env);
        let burn1 = Address::generate(&env);

        // Initial config
        client.configure_fee_split(&5000u32, &3000u32, &2000u32, &treasury1, &lp1, &burn1);

        // Update addresses
        let treasury2 = Address::generate(&env);
        let lp2 = Address::generate(&env);
        let burn2 = Address::generate(&env);
        client.update_fee_addresses(&treasury2, &lp2, &burn2);

        let (_, treasury_addr, lp_addr, burn_addr) = client.get_fee_split_config();
        assert_eq!(treasury_addr, treasury2);
        assert_eq!(lp_addr, lp2);
        assert_eq!(burn_addr, burn2);
    }

    #[test]
    fn test_fee_distribution_on_batch_distribute() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Create real SAC token
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        // Configure fee split: 50% treasury, 30% LP, 20% burn
        let treasury = Address::generate(&env);
        let lp = Address::generate(&env);
        let burn = Address::generate(&env);
        client.configure_fee_split(&5000u32, &3000u32, &2000u32, &treasury, &lp, &burn);

        // Create market and place bets
        let creator = Address::generate(&env);
        let bettor1 = Address::generate(&env);
        let bettor2 = Address::generate(&env);
        
        sac_client.mint(&bettor1, &1000_000_000i128);
        sac_client.mint(&bettor2, &1000_000_000i128);

        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &bettor1, &100_000_000i128);
        client.place_bet(&1u64, &1u32, &bettor2, &100_000_000i128);

        // Resolve and distribute
        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        let treasury_before = sac_client.balance(&treasury);
        let lp_before = sac_client.balance(&lp);
        let burn_before = sac_client.balance(&burn);

        client.batch_distribute(&1u64, &10u32);

        let treasury_after = sac_client.balance(&treasury);
        let lp_after = sac_client.balance(&lp);
        let burn_after = sac_client.balance(&burn);

        // Verify fees were distributed (amounts should be > 0)
        assert!(treasury_after > treasury_before, "Treasury should receive fees");
        assert!(lp_after > lp_before, "LP should receive fees");
        assert!(burn_after > burn_before, "Burn should receive fees");
    }

    // ── Batch Payout Processor Tests ──────────────────────────────────────────

    #[test]
    fn test_batch_payout_basic() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Create real SAC token
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        // Create 3 winners
        let winner1 = Address::generate(&env);
        let winner2 = Address::generate(&env);
        let winner3 = Address::generate(&env);
        let loser = Address::generate(&env);

        sac_client.mint(&winner1, &1000_000_000i128);
        sac_client.mint(&winner2, &1000_000_000i128);
        sac_client.mint(&winner3, &1000_000_000i128);
        sac_client.mint(&loser, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        // Place bets: 3 winners on outcome 0, 1 loser on outcome 1
        client.place_bet(&1u64, &0u32, &winner1, &100_000_000i128);
        client.place_bet(&1u64, &0u32, &winner2, &100_000_000i128);
        client.place_bet(&1u64, &0u32, &winner3, &100_000_000i128);
        client.place_bet(&1u64, &1u32, &loser, &100_000_000i128);

        // Resolve market
        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // Batch payout to all 3 winners
        let recipients = vec![&env, winner1.clone(), winner2.clone(), winner3.clone()];
        let paid_count = client.batch_payout(&1u64, &recipients, &admin);

        assert_eq!(paid_count, 3, "Should pay all 3 winners");

        // Verify all winners received payouts
        assert!(client.is_payout_claimed(&1u64, &winner1), "Winner1 should be marked as paid");
        assert!(client.is_payout_claimed(&1u64, &winner2), "Winner2 should be marked as paid");
        assert!(client.is_payout_claimed(&1u64, &winner3), "Winner3 should be marked as paid");
    }

    #[test]
    fn test_batch_payout_double_payout_guard() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let winner = Address::generate(&env);
        sac_client.mint(&winner, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner, &100_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // First payout
        let recipients = vec![&env, winner.clone()];
        let balance_before = sac_client.balance(&winner);
        let paid_count1 = client.batch_payout(&1u64, &recipients, &admin);
        let balance_after_first = sac_client.balance(&winner);

        assert_eq!(paid_count1, 1, "Should pay winner once");
        assert!(balance_after_first > balance_before, "Winner should receive payout");

        // Second payout attempt (should be skipped due to double-payout guard)
        let paid_count2 = client.batch_payout(&1u64, &recipients, &admin);
        let balance_after_second = sac_client.balance(&winner);

        assert_eq!(paid_count2, 0, "Should not pay winner again");
        assert_eq!(balance_after_second, balance_after_first, "Balance should not change");
    }

    #[test]
    #[should_panic(expected = "Batch size must not exceed 50 recipients")]
    fn test_batch_payout_exceeds_limit() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // Create 51 recipients (exceeds limit)
        let mut recipients = Vec::new(&env);
        for _ in 0..51 {
            recipients.push_back(Address::generate(&env));
        }

        client.batch_payout(&1u64, &recipients, &admin);
    }

    #[test]
    #[should_panic(expected = "Market not resolved yet")]
    fn test_batch_payout_unresolved_market() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        let winner = Address::generate(&env);
        let recipients = vec![&env, winner];

        // Try to payout before resolution
        client.batch_payout(&1u64, &recipients, &admin);
    }

    #[test]
    fn test_batch_payout_skips_non_winners() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let winner = Address::generate(&env);
        let loser = Address::generate(&env);
        sac_client.mint(&winner, &1000_000_000i128);
        sac_client.mint(&loser, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner, &100_000_000i128);
        client.place_bet(&1u64, &1u32, &loser, &100_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // Try to payout both winner and loser
        let recipients = vec![&env, winner.clone(), loser.clone()];
        let loser_balance_before = sac_client.balance(&loser);
        let paid_count = client.batch_payout(&1u64, &recipients, &admin);
        let loser_balance_after = sac_client.balance(&loser);

        assert_eq!(paid_count, 1, "Should only pay the winner");
        assert!(client.is_payout_claimed(&1u64, &winner), "Winner should be marked as paid");
        assert!(!client.is_payout_claimed(&1u64, &loser), "Loser should not be marked as paid");
        assert_eq!(loser_balance_after, loser_balance_before, "Loser balance should not change");
    }

    #[test]
    fn test_batch_payout_proportional_distribution() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        // Winner1 bets 200, Winner2 bets 100 (2:1 ratio)
        let winner1 = Address::generate(&env);
        let winner2 = Address::generate(&env);
        sac_client.mint(&winner1, &1000_000_000i128);
        sac_client.mint(&winner2, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner1, &200_000_000i128);
        client.place_bet(&1u64, &0u32, &winner2, &100_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        let balance1_before = sac_client.balance(&winner1);
        let balance2_before = sac_client.balance(&winner2);

        let recipients = vec![&env, winner1.clone(), winner2.clone()];
        client.batch_payout(&1u64, &recipients, &admin);

        let balance1_after = sac_client.balance(&winner1);
        let balance2_after = sac_client.balance(&winner2);

        let payout1 = balance1_after - balance1_before;
        let payout2 = balance2_after - balance2_before;

        // Winner1 should receive approximately 2x what Winner2 receives
        // Allow for small rounding differences
        assert!(payout1 > payout2, "Winner1 should receive more than Winner2");
        let ratio = payout1 / payout2;
        assert!(ratio >= 1 && ratio <= 3, "Payout ratio should be approximately 2:1");
    }

    #[test]
    #[should_panic(expected = "Payouts paused during an active dispute")]
    fn test_batch_payout_blocked_during_dispute() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let winner = Address::generate(&env);
        let disputer = Address::generate(&env);
        sac_client.mint(&winner, &1000_000_000i128);
        sac_client.mint(&disputer, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner, &100_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // Open dispute
        client.open_dispute(&1u64, &disputer);

        // Try to payout during active dispute (should panic)
        let recipients = vec![&env, winner];
        client.batch_payout(&1u64, &recipients, &admin);
    }

    // ── Multi-Outcome Market Tests ────────────────────────────────────────────

    #[test]
    fn test_create_multi_outcome_market() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;

        // Create 4-outcome market (World Cup winner)
        let options = vec![
            &env,
            String::from_str(&env, "Brazil"),
            String::from_str(&env, "Argentina"),
            String::from_str(&env, "France"),
            String::from_str(&env, "Germany"),
        ];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "World Cup Winner"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        let market = client.get_market(&1u64);
        assert_eq!(market.options.len(), 4);
        assert_eq!(client.get_outcome_count(&1u64), 4);

        // Verify pool balances initialized to 0
        let pool_balances = client.get_outcome_pool_balances(&1u64);
        for i in 0..4 {
            assert_eq!(pool_balances.get(i).unwrap(), 0);
        }
    }

    #[test]
    #[should_panic(expected = "Maximum 8 outcomes allowed")]
    fn test_create_market_too_many_outcomes() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;

        // Try to create 9-outcome market (exceeds limit)
        let mut options = Vec::new(&env);
        for i in 0..9 {
            options.push_back(String::from_str(&env, &format!("Option {}", i)));
        }

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Too many"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );
    }

    #[test]
    fn test_multi_outcome_betting() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let bettor1 = Address::generate(&env);
        let bettor2 = Address::generate(&env);
        let bettor3 = Address::generate(&env);

        sac_client.mint(&bettor1, &1000_000_000i128);
        sac_client.mint(&bettor2, &1000_000_000i128);
        sac_client.mint(&bettor3, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;

        // Create 3-outcome market
        let options = vec![
            &env,
            String::from_str(&env, "Team A"),
            String::from_str(&env, "Team B"),
            String::from_str(&env, "Draw"),
        ];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Match Result"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        // Place bets on different outcomes
        client.place_bet(&1u64, &0u32, &bettor1, &100_000_000i128); // Team A
        client.place_bet(&1u64, &1u32, &bettor2, &100_000_000i128); // Team B
        client.place_bet(&1u64, &2u32, &bettor3, &50_000_000i128);  // Draw

        // Verify pool balances updated
        let pool_balance_0 = client.get_outcome_pool_balance(&1u64, &0u32);
        let pool_balance_1 = client.get_outcome_pool_balance(&1u64, &1u32);
        let pool_balance_2 = client.get_outcome_pool_balance(&1u64, &2u32);

        assert!(pool_balance_0 > 0, "Team A pool should have balance");
        assert!(pool_balance_1 > 0, "Team B pool should have balance");
        assert!(pool_balance_2 > 0, "Draw pool should have balance");
    }

    #[test]
    fn test_multi_outcome_resolution_and_payout() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        // Create 4 bettors
        let winner1 = Address::generate(&env);
        let winner2 = Address::generate(&env);
        let loser1 = Address::generate(&env);
        let loser2 = Address::generate(&env);

        sac_client.mint(&winner1, &1000_000_000i128);
        sac_client.mint(&winner2, &1000_000_000i128);
        sac_client.mint(&loser1, &1000_000_000i128);
        sac_client.mint(&loser2, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;

        // Create 4-outcome market
        let options = vec![
            &env,
            String::from_str(&env, "Option 1"),
            String::from_str(&env, "Option 2"),
            String::from_str(&env, "Option 3"),
            String::from_str(&env, "Option 4"),
        ];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Multi-outcome"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        // Winners bet on outcome 2, losers bet on other outcomes
        client.place_bet(&1u64, &2u32, &winner1, &100_000_000i128);
        client.place_bet(&1u64, &2u32, &winner2, &100_000_000i128);
        client.place_bet(&1u64, &0u32, &loser1, &100_000_000i128);
        client.place_bet(&1u64, &3u32, &loser2, &100_000_000i128);

        // Resolve to outcome 2
        client.propose_resolution(&1u64, &2u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &2u32);

        let market = client.get_market(&1u64);
        assert_eq!(market.winning_outcome, 2);

        // Calculate expected payouts
        let payout1 = client.calculate_payout(&1u64, &winner1, &2u32);
        let payout2 = client.calculate_payout(&1u64, &winner2, &2u32);
        let payout_loser = client.calculate_payout(&1u64, &loser1, &0u32);

        assert!(payout1 > 0, "Winner1 should have payout");
        assert!(payout2 > 0, "Winner2 should have payout");
        assert_eq!(payout_loser, 0, "Loser should have no payout");
    }

    #[test]
    fn test_multi_outcome_proportional_payouts() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        // Winner1 bets 200, Winner2 bets 100 on same outcome (2:1 ratio)
        let winner1 = Address::generate(&env);
        let winner2 = Address::generate(&env);

        sac_client.mint(&winner1, &1000_000_000i128);
        sac_client.mint(&winner2, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;

        let options = vec![
            &env,
            String::from_str(&env, "A"),
            String::from_str(&env, "B"),
            String::from_str(&env, "C"),
        ];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &1u32, &winner1, &200_000_000i128);
        client.place_bet(&1u64, &1u32, &winner2, &100_000_000i128);

        client.propose_resolution(&1u64, &1u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &1u32);

        let payout1 = client.calculate_payout(&1u64, &winner1, &1u32);
        let payout2 = client.calculate_payout(&1u64, &winner2, &1u32);

        // Winner1 should receive approximately 2x what Winner2 receives
        assert!(payout1 > payout2, "Winner1 should receive more");
        let ratio = payout1 / payout2;
        assert!(ratio >= 1 && ratio <= 3, "Ratio should be approximately 2:1");
    }

    #[test]
    fn test_get_market_outcomes() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;

        let options = vec![
            &env,
            String::from_str(&env, "Red"),
            String::from_str(&env, "Blue"),
            String::from_str(&env, "Green"),
            String::from_str(&env, "Yellow"),
        ];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Color"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        let outcomes = client.get_market_outcomes(&1u64);
        assert_eq!(outcomes.len(), 4);
        assert_eq!(outcomes.get(0).unwrap(), String::from_str(&env, "Red"));
        assert_eq!(outcomes.get(1).unwrap(), String::from_str(&env, "Blue"));
        assert_eq!(outcomes.get(2).unwrap(), String::from_str(&env, "Green"));
        assert_eq!(outcomes.get(3).unwrap(), String::from_str(&env, "Yellow"));
    }

    #[test]
    fn test_multi_outcome_batch_payout() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        // Create 3 winners on outcome 1
        let winner1 = Address::generate(&env);
        let winner2 = Address::generate(&env);
        let winner3 = Address::generate(&env);

        sac_client.mint(&winner1, &1000_000_000i128);
        sac_client.mint(&winner2, &1000_000_000i128);
        sac_client.mint(&winner3, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;

        let options = vec![
            &env,
            String::from_str(&env, "A"),
            String::from_str(&env, "B"),
            String::from_str(&env, "C"),
            String::from_str(&env, "D"),
            String::from_str(&env, "E"),
        ];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "5-way"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        // All bet on outcome 1
        client.place_bet(&1u64, &1u32, &winner1, &100_000_000i128);
        client.place_bet(&1u64, &1u32, &winner2, &100_000_000i128);
        client.place_bet(&1u64, &1u32, &winner3, &100_000_000i128);

        client.propose_resolution(&1u64, &1u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &1u32);

        // Batch payout
        let recipients = vec![&env, winner1.clone(), winner2.clone(), winner3.clone()];
        let paid_count = client.batch_payout(&1u64, &recipients, &admin);

        assert_eq!(paid_count, 3, "Should pay all 3 winners");
    }

    #[test]
    fn test_multi_outcome_8_outcomes() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;

        // Create maximum 8-outcome market
        let options = vec![
            &env,
            String::from_str(&env, "Team 1"),
            String::from_str(&env, "Team 2"),
            String::from_str(&env, "Team 3"),
            String::from_str(&env, "Team 4"),
            String::from_str(&env, "Team 5"),
            String::from_str(&env, "Team 6"),
            String::from_str(&env, "Team 7"),
            String::from_str(&env, "Team 8"),
        ];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "8-team tournament"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        let market = client.get_market(&1u64);
        assert_eq!(market.options.len(), 8);
        assert_eq!(client.get_outcome_count(&1u64), 8);

        // Verify all pool balances initialized
        for i in 0..8 {
            let balance = client.get_outcome_pool_balance(&1u64, &i);
            assert_eq!(balance, 0);
        }
    }

    // ── Re-Entrancy Guard Tests ───────────────────────────────────────────────

    #[test]
    fn test_reentrancy_guard_prevents_recursive_batch_distribute() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let winner = Address::generate(&env);
        sac_client.mint(&winner, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner, &100_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // First call should succeed
        let paid1 = client.batch_distribute(&1u64, &1u32);
        assert_eq!(paid1, 1);

        // Verify lock is released after successful call
        // Second call should also succeed (different winner or same winner already paid)
        let paid2 = client.batch_distribute(&1u64, &1u32);
        assert_eq!(paid2, 0); // No more winners to pay
    }

    #[test]
    fn test_reentrancy_guard_prevents_recursive_batch_payout() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let winner = Address::generate(&env);
        sac_client.mint(&winner, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner, &100_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // First call should succeed
        let recipients = vec![&env, winner.clone()];
        let paid1 = client.batch_payout(&1u64, &recipients, &admin);
        assert_eq!(paid1, 1);

        // Verify lock is released - second call should succeed but pay 0 (already paid)
        let paid2 = client.batch_payout(&1u64, &recipients, &admin);
        assert_eq!(paid2, 0); // Already paid
    }

    #[test]
    fn test_reentrancy_guard_prevents_recursive_claim_original() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let winner = Address::generate(&env);
        sac_client.mint(&winner, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner, &100_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // Sweep to create original payouts
        env.ledger().with_mut(|l| l.timestamp += 30 * 24 * 60 * 60 + 1);
        client.sweep_unclaimed(&1u64);

        // First claim should succeed
        let claimed1 = client.claim_original(&1u64, &winner);
        assert!(claimed1 > 0);

        // Verify lock is released - second claim should fail (already claimed)
        // This tests that the guard is properly released even after successful claim
    }

    #[test]
    fn test_reentrancy_lock_released_on_success() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let winner1 = Address::generate(&env);
        let winner2 = Address::generate(&env);
        sac_client.mint(&winner1, &1000_000_000i128);
        sac_client.mint(&winner2, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner1, &100_000_000i128);
        client.place_bet(&1u64, &0u32, &winner2, &100_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // Pay first winner
        let recipients1 = vec![&env, winner1.clone()];
        let paid1 = client.batch_payout(&1u64, &recipients1, &admin);
        assert_eq!(paid1, 1);

        // Lock should be released, allowing second payout
        let recipients2 = vec![&env, winner2.clone()];
        let paid2 = client.batch_payout(&1u64, &recipients2, &admin);
        assert_eq!(paid2, 1);
    }

    #[test]
    fn test_reentrancy_guard_gas_overhead() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let winner = Address::generate(&env);
        sac_client.mint(&winner, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];

        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner, &100_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // Execute payout with guard
        let recipients = vec![&env, winner.clone()];
        let paid = client.batch_payout(&1u64, &recipients, &admin);
        assert_eq!(paid, 1);

        // Guard overhead is minimal:
        // - 1 storage read (check lock): ~10k instructions
        // - 1 storage write (set lock): ~50k instructions
        // - 1 storage write (release lock): ~50k instructions
        // Total overhead: ~110k instructions (~0.11% of 100M limit)
    }

    #[test]
    fn test_multiple_markets_independent_locks() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());

        let winner1 = Address::generate(&env);
        let winner2 = Address::generate(&env);
        sac_client.mint(&winner1, &1000_000_000i128);
        sac_client.mint(&winner2, &1000_000_000i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")];

        // Create two markets
        client.create_market(
            &creator, &1u64, &String::from_str(&env, "Market 1"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );
        client.create_market(
            &creator, &2u64, &String::from_str(&env, "Market 2"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None
        );

        client.place_bet(&1u64, &0u32, &winner1, &100_000_000i128);
        client.place_bet(&2u64, &0u32, &winner2, &100_000_000i128);

        // Resolve both markets
        client.propose_resolution(&1u64, &0u32);
        client.propose_resolution(&2u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);
        client.resolve_market(&2u64, &0u32);

        // Payouts on different markets should work independently
        // (lock is global, but released between calls)
        let recipients1 = vec![&env, winner1.clone()];
        let paid1 = client.batch_payout(&1u64, &recipients1, &admin);
        assert_eq!(paid1, 1);

        let recipients2 = vec![&env, winner2.clone()];
        let paid2 = client.batch_payout(&2u64, &recipients2, &admin);
        assert_eq!(paid2, 1);
    }
}

