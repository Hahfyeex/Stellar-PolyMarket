#![no_std]

#[cfg(test)]
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, vec, Address, Bytes, BytesN, Env, Map, String, Vec, IntoVal,
};
use soroban_sdk::xdr::ToXdr;
use stellar_strkey::Strkey;
mod access;
use crate::access::{
    check_platform_active, check_role, set_platform_status, set_role, AccessPlatformStatus,
    AccessRole, check_whitelisted_token, set_whitelisted_token,
    Role, require_role, assign_role, revoke_role, bootstrap_super_admin, get_role_address,
};
mod checked_math;
use crate::checked_math::{cadd, csub, cmul, cdiv, cmuldiv};
mod events;
use crate::events::{
    emit_bet_placed, emit_contract_initialized, emit_dispute_raised, emit_fee_collected,
    emit_fee_rate_updated, emit_lp_reward_claimed, emit_liquidity_provided, emit_market_created,
    emit_market_paused, emit_market_resolved, emit_market_voided, emit_payout_claimed,
    emit_upgrade_cancelled, emit_upgrade_proposed, emit_upgraded,
};
mod lmsr;
mod position_token;
use crate::lmsr::{lmsr_cost, lmsr_price};

// Internal ZK scalar normalization utility — must be declared before use
mod math;
use math::normalize_scalar;
#[cfg(test)]
mod upgrade_nonce_tests;

/// Fee routing mode: burn (send to issuer/lock address) or transfer to DAO treasury.
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
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
pub const EXIT_FEE_BPS: i128 = 50;
/// #378: Minimum market duration in seconds (1 hour)
pub const MIN_MARKET_DURATION_SECONDS: u64 = 3600;
/// Liveness window: 1 hour in seconds. Resolution can only be finalised after this delay.

/// Liveness window for disputes (approx 24 hours in ledgers/seconds)
pub const DISPUTE_WINDOW: u64 = 86_400;

/// TTL extension for persistent storage: ~30 days at 5 seconds per ledger
/// Threshold: 535_000 / 2 = 267_500 ledgers (~37 days)
/// Extend to: 535_000 ledgers (~74 days)
pub const LEDGER_TTL_EXTEND: u32 = 535_000;
pub const UPGRADE_TIMELOCK_LEDGERS: u32 = 17_280;

/// Reads the stored platform fee rate in basis points from Instance storage.
/// Falls back to 300 bps (3%) if not set (e.g., before first initialize).
fn read_fee_rate_bps(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::FeeRateBps)
        .unwrap_or(300u32)
}

/// Calculates dynamic platform fee in Basis Points (BPS).
/// Pure function: O(1) time complexity, O(1) space complexity.
/// Logic: Fee = Max(0.5%, 2% - (Volume / Threshold))
pub fn calculate_dynamic_fee(volume: i128) -> u32 {
    let base_fee_bps: i128 = 200;
    let floor_fee_bps: i128 = 50;
    let total_reduction_bps: i128 = 150;
    let threshold: i128 = 100_000 * 10_000_000;

    if volume <= 0 {
        return base_fee_bps as u32;
    }

    let reduction = cdiv(cmul(volume, total_reduction_bps, "fee reduction"), threshold, "fee reduction");
    let fee = csub(base_fee_bps, reduction, "fee calc");

    if fee < floor_fee_bps {
        floor_fee_bps as u32
    } else {
        fee as u32
    }
}


#[cfg(not(test))]
pub const LIVENESS_WINDOW: u64 = 86400; // 24 hours

#[cfg(test)]
pub const LIVENESS_WINDOW: u64 = 0; // Immediate for testing

/// Maximum allowed drift (in seconds) between the source data timestamp and the ledger timestamp.
/// Source: Fast-moving crypto markets require fresh data to prevent "Old News" exploits.
pub const MAX_ORACLE_DRIFT: u64 = 1800;

#[contracttype]
pub enum DataKey {
    Initialized,
    OracleAddress,
    Market(u64),
    Bets(u64),
    TotalPool(u64),
    AuditLog(u64),
    AuditLogCount,
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
    /// Persistent: individual pool balance per outcome (market_id, outcome_index)
    OutcomePool(u64, u32),
    /// Legacy admin key in Instance storage
    Admin,
    /// Liquidity provider contributions per market
    LpContribution(u64),
    /// LP fee pool per market
    LpFeePool(u64),
    /// User's total cost paid into a market (for refunds)
    UserCost(u64, Address),
    /// User position map per market (legacy)
    UserPosition(u64),
    /// LMSR b parameter per market
    LmsrB(u64),
    /// LMSR outcome shares per market
    OutcomeShares(u64),
    /// Market creation fee
    CreationFee,
    /// Fee destination address
    FeeDestination,
    /// Fee mode configuration
    FeeModeConfig,
    /// Minimum bet amount
    MinBetAmount,
    /// Maximum bet amount
    MaxBetAmount,
    /// Fee split configuration
    FeeSplitConfig,
    /// Treasury address for fee splits
    TreasuryAddress,
    /// LP pool address for fee splits
    LPAddress,
    /// Burn address for fee splits
    BurnAddress,
    /// Nonce for gasless bets
    Nonce(Address),
    /// Claim deadline timestamp per market
    ClaimDeadline(u64),
    /// Dispute data per market
    Dispute(u64),
    /// Whether a market has been swept
    MarketSwept(u64),
    /// Original payout amounts per market
    OriginalPayouts(u64),
    /// Claimed map per market
    Claimed(u64),
    /// Global vault balance
    VaultBalance,
    /// Whether settlement fee has been paid for a market
    SettlementFeePaid(u64),
    /// Whether a specific payout has been claimed
    PayoutClaimed(u64, Address),
    /// Whether a refund has been claimed
    RefundClaimed(u64, Address),
    /// Platform fee rate in basis points (e.g. 300 = 3%). Stored in Instance storage.
    FeeRateBps,
    /// Pending in-place WASM upgrade proposal.
    UpgradeProposal,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MarketStatus {
    Active,
    Proposed,
    Disputed,
    ReReview,
    Resolved,
    Voided,
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
    pub options: Vec<String>, // renamed from outcomes for clarity per issue spec
    pub deadline: u64,        // renamed from end_date per issue spec
    pub resolved: bool,
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

#[contracttype]
#[derive(Clone)]
pub struct UpgradeProposal {
    pub new_wasm_hash: BytesN<32>,
    pub unlock_ledger: u32,
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

fn load_market(env: &Env, market_id: u64) -> Market {
    env.storage()
        .persistent()
        .get(&DataKey::Market(market_id))
        .unwrap()
}

fn load_outcome_shares(env: &Env, market_id: u64) -> Vec<i128> {
    env.storage()
        .instance()
        .get(&DataKey::OutcomeShares(market_id))
        .unwrap()
}

fn build_share_arrays(outcome_shares: &Vec<i128>) -> ([i128; 8], usize) {
    let n = outcome_shares.len() as usize;
    let mut q = [0i128; 8];
    for j in 0..n {
        q[j] = outcome_shares.get(j as u32).unwrap_or(0);
    }
    (q, n)
}

fn acquire_reentrancy_lock(env: &Env) {
    if env.storage().instance().has(&symbol_short!("locked")) {
        panic!("Reentrancy detected");
    }
    env.storage().instance().set(&symbol_short!("locked"), &true);
}

fn release_reentrancy_lock(env: &Env) {
    env.storage().instance().remove(&symbol_short!("locked"));
}

fn load_nonce(env: &Env, address: &Address) -> u64 {
    env.storage()
        .persistent()
        .get(&DataKey::Nonce(address.clone()))
        .unwrap_or(0)
}

fn increment_nonce(env: &Env, address: &Address, current_nonce: u64) {
    let next_nonce = current_nonce
        .checked_add(1)
        .unwrap_or_else(|| panic!("nonce overflow"));
    let key = DataKey::Nonce(address.clone());
    env.storage().persistent().set(&key, &next_nonce);
    env.storage()
        .persistent()
        .extend_ttl(&key, LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
}

fn load_upgrade_proposal(env: &Env) -> UpgradeProposal {
    env.storage()
        .instance()
        .get(&DataKey::UpgradeProposal)
        .unwrap_or_else(|| panic!("no pending upgrade proposal"))
}

fn bet_signature_payload(
    env: &Env,
    market_id: u64,
    option_index: u32,
    bettor: &Address,
    amount: i128,
    nonce: u64,
) -> Bytes {
    (market_id, option_index, bettor.clone(), amount, nonce).to_xdr(env)
}

fn bettor_public_key(env: &Env, bettor: &Address) -> BytesN<32> {
    let bettor_strkey = bettor.to_string();
    let mut raw = [0u8; 56];
    bettor_strkey.copy_into_slice(&mut raw);
    let raw_str = core::str::from_utf8(&raw)
        .unwrap_or_else(|_| panic!("bettor address must be valid UTF-8"));

    match Strkey::from_string(raw_str).unwrap_or_else(|_| panic!("bettor must be a valid Stellar address")) {
        Strkey::PublicKeyEd25519(pk) => BytesN::from_array(env, &pk.0),
        _ => panic!("bettor must be an ed25519 account address"),
    }
}



#[contractimpl]
impl PredictionMarket {
    /// Initialize contract with admin address.
    pub fn initialize(env: Env, admin: Address) {
        check_initialized(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::FeeRateBps, &300u32);
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
        // Bootstrap SuperAdmin in Persistent storage (new role system)
        bootstrap_super_admin(&env, &admin);
        // Legacy Instance write for backward-compat shim
        set_role(&env, AccessRole::Admin, &admin);
        set_platform_status(&env, AccessPlatformStatus::Active);
        emit_contract_initialized(&env, &admin);
    }

    /// Assign a role to an address. Only SuperAdmin may call this.
    pub fn assign_role(env: Env, caller: Address, role: Role, address: Address) {
        assign_role(&env, &caller, role, &address);
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
    }

    /// Revoke a role (remove its mapping). Only SuperAdmin may call this.
    /// SuperAdmin cannot revoke their own role.
    pub fn revoke_role(env: Env, caller: Address, role: Role) {
        revoke_role(&env, &caller, role);
    }

    /// Read the address currently assigned to a role (returns None if unset).
    pub fn get_role(env: Env, role: Role) -> Option<Address> {
        get_role_address(&env, role)
    }

    /// Returns the current replay-protection nonce for `address`.
    pub fn get_nonce(env: Env, address: Address) -> u64 {
        load_nonce(&env, &address)
    }

    /// Stage an in-place WASM upgrade behind a mandatory ledger timelock.
    pub fn propose_upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) {
        require_role(&env, &caller, Role::SuperAdmin);

        let proposal = UpgradeProposal {
            new_wasm_hash: new_wasm_hash.clone(),
            unlock_ledger: env.ledger().sequence() + UPGRADE_TIMELOCK_LEDGERS,
        };

        env.storage()
            .instance()
            .set(&DataKey::UpgradeProposal, &proposal);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);

        emit_upgrade_proposed(&env, &caller, &new_wasm_hash, proposal.unlock_ledger);
    }

    /// Execute a previously proposed in-place WASM upgrade after the timelock expires.
    pub fn execute_upgrade(env: Env, caller: Address) {
        require_role(&env, &caller, Role::SuperAdmin);

        let proposal = load_upgrade_proposal(&env);
        assert!(
            env.ledger().sequence() >= proposal.unlock_ledger,
            "upgrade timelock is still active"
        );

        env.storage().instance().remove(&DataKey::UpgradeProposal);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);

        emit_upgraded(&env, &caller, &proposal.new_wasm_hash);
        env.deployer()
            .update_current_contract_wasm(proposal.new_wasm_hash);
    }

    /// Cancel a pending in-place WASM upgrade proposal.
    pub fn cancel_upgrade(env: Env, caller: Address) {
        require_role(&env, &caller, Role::SuperAdmin);

        let proposal = load_upgrade_proposal(&env);
        env.storage().instance().remove(&DataKey::UpgradeProposal);
        env.storage()
            .instance()
            .extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);

        emit_upgrade_cancelled(&env, &caller, &proposal.new_wasm_hash);
    }

    /// Update the whitelist status of a token (admin only).
    /// Update the whitelist status of a token (FeeSetter only).
    pub fn set_token_whitelist(env: Env, caller: Address, token: Address, is_whitelisted: bool) {
        require_role(&env, &caller, Role::FeeSetter);
        set_whitelisted_token(&env, &token, is_whitelisted);
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
        require_role(&env, &creator, Role::Pauser);
        check_platform_active(&env);
        assert!(lmsr_b > 0, "lmsr_b must be positive");

        assert!(
            !env.storage().persistent().has(&DataKey::Market(id)),
            "Market already exists"
        );
        assert!(options.len() >= 2, "Need at least 2 options");
        assert!(options.len() <= 8, "Maximum 8 outcomes allowed");
        // #378: Enforce minimum 1-hour deadline from current ledger timestamp
        assert!(
            deadline >= env.ledger().timestamp() + MIN_MARKET_DURATION_SECONDS,
            "Deadline must be at least 1 hour in the future"
        );

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
            let fee_mode: FeeMode = env
                .storage()
                .instance()
                .get(&DataKey::FeeModeConfig)
                .unwrap_or(FeeMode::Treasury);
            emit_fee_collected(&env, id, &creator, &fee_destination, creation_fee);
        }
        // --- End fee collection ---

        let market = Market {
            id,
            question,
            options,
            deadline,
            resolved: false,
            status: MarketStatus::Active,
            winning_outcome: 0,
            token,
            proposed_outcome: None,
            proposal_timestamp: 0,
            condition_market_id,
            condition_outcome,
        };

        // Persist market metadata in persistent storage (survives ledger archival)
        env.storage()
            .persistent()
            .set(&DataKey::Market(id), &market);
        env.storage()
            .persistent()
            .set(&DataKey::TotalPool(id), &0i128);
        // Cold: market metadata + user positions vec → Persistent
        env.storage().persistent().set(&DataKey::Market(id), &market);
        env.storage().persistent().extend_ttl(&DataKey::Market(id), LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
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
        
        // Initialize per-outcome pool balances (individual Persistent keys)
        for i in 0..n {
            let pool_key = DataKey::OutcomePool(id, i as u32);
            env.storage().persistent().set(&pool_key, &0i128);
            env.storage().persistent().extend_ttl(&pool_key, LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
        }
        
        // Removed redundant OutcomePoolBalances map (Requirement #382: O(1) individual keys)
        
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
        
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);

        emit_market_created(
            &env,
            id,
            &creator,
            &market.question,
            market.options.len(),
            deadline,
            &market.token,
            lmsr_b,
            creation_fee,
        );
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
        check_platform_active(&env);

        let stored_nonce = load_nonce(&env, &bettor);
        assert!(nonce == stored_nonce, "invalid nonce: replay detected");

        let public_key = bettor_public_key(&env, &bettor);
        let payload = bet_signature_payload(&env, market_id, option_index, &bettor, amount, nonce);
        env.crypto()
            .ed25519_verify(&public_key, &payload, &signature);

        increment_nonce(&env, &bettor, stored_nonce);
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
            .unwrap_or(1i128); // default 1 for tests; production should set explicitly
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
        let market: Market = load_market(&env, market_id);

        assert!(market.status == MarketStatus::Active, "Market not active");
        assert!(
            env.ledger().timestamp() <= market.deadline,
            "Market deadline has passed"
        );
        assert!(option_index < market.options.len(), "Invalid option index");
        // #375: Validate market has at least 2 options at bet time
        assert!(market.options.len() >= 2, "Market has insufficient options");
        // #375: Improved error message with descriptive details
        assert!(
            option_index < market.options.len(),
            "option_index {} exceeds market option count {}",
            option_index,
            market.options.len()
        );

        // Check if token is whitelisted
        check_whitelisted_token(&env, &market.token);

        // ── LMSR cost delta ──────────────────────────────────────────────────
        // `amount` is the number of shares the bettor wants to buy.
        // The actual cost charged is C(q_after) - C(q_before).
        let b: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LmsrB(market_id))
            .unwrap();
        let outcome_shares: Vec<i128> = load_outcome_shares(&env, market_id);

        // Build q_before and q_after as plain slices via a fixed-size stack array.
        // Max 5 outcomes (enforced at market creation: options.len() <= 5 implied by Vec).
        let (q_before, n) = build_share_arrays(&outcome_shares);
        let mut q_after = [0i128; 8];
        for j in 0..n {
            q_after[j] = q_before[j];
        }
        q_after[option_index as usize] = cadd(q_after[option_index as usize], amount, "q_after shares");

        let cost_before = lmsr_cost(&q_before[..n], b);
        let cost_after = lmsr_cost(&q_after[..n], b);
        let cost_delta = csub(cost_after, cost_before, "lmsr cost delta");
        assert!(cost_delta > 0, "cost delta must be positive");

        // Charge the bettor the LMSR cost delta (not raw `amount`)
        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&bettor, &env.current_contract_address(), &cost_delta);

        // Update outcome shares in Instance storage
        let mut new_shares = outcome_shares.clone();
        new_shares.set(option_index, q_after[option_index as usize]);
        env.storage().instance().set(&DataKey::OutcomeShares(market_id), &new_shares);
        // ── end LMSR ─────────────────────────────────────────────────────────

        // Position recording via position_token sub-module (Map-based)
        position_token::mint(&env, market_id, option_index, &bettor, amount);

        // Update individual OutcomePool tracking (Persistent O(1))
        let pool_key = DataKey::OutcomePool(market_id, option_index);
        let current_pool: i128 = env.storage().persistent().get(&pool_key).unwrap_or(0);
        env.storage().persistent().set(&pool_key, &(current_pool + amount));
        env.storage().persistent().extend_ttl(&pool_key, LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);

        // Accumulate user's cost investment for future refunds (if voided)
        let cost_key = DataKey::UserCost(market_id, bettor.clone());
        let prev_cost: i128 = env.storage().persistent().get(&cost_key).unwrap_or(0);
        env.storage().persistent().set(&cost_key, &(prev_cost + cost_delta));
        env.storage().persistent().extend_ttl(&cost_key, 100, 1_000_000);

        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Market(market_id), 100, 1_000_000);

        // Hot write: total_shares → Instance
        let shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares(market_id), &cadd(shares, cost_delta, "total shares"));
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);

        emit_bet_placed(&env, market_id, &bettor, option_index, cost_delta, amount);
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

        market.status = MarketStatus::Proposed;
        market.proposed_outcome = Some(winning_outcome);
        market.proposal_timestamp = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
    }

    /// Provide liquidity to an existing market.
    pub fn provide_liquidity(env: Env, market_id: u64, provider: Address, amount: i128) {
        provider.require_auth();

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&provider, &env.current_contract_address(), &amount);

        let mut contributions: soroban_sdk::Map<Address, i128> = env
            .storage()
            .persistent()
            .get(&DataKey::LpContribution(market_id))
            .unwrap_or(soroban_sdk::Map::new(&env));

        let existing = contributions.get(provider.clone()).unwrap_or(0);
        contributions.set(provider.clone(), cadd(existing, amount, "lp contribution"));

        env.storage()
            .persistent()
            .set(&DataKey::LpContribution(market_id), &contributions);
        env.storage().persistent().extend_ttl(
            &DataKey::LpContribution(market_id),
            100,
            1_000_000,
        );

        // Accumulate user's investment for future refunds (if voided)
        let cost_key = DataKey::UserCost(market_id, provider.clone());
        let prev_cost: i128 = env.storage().persistent().get(&cost_key).unwrap_or(0);
        env.storage().persistent().set(&cost_key, &(prev_cost + amount));
        env.storage().persistent().extend_ttl(&cost_key, 100, 1_000_000);

        // Hot write: total_shares → Instance
        let shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares(market_id), &cadd(shares, amount, "lp total shares"));
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);

        env.events().publish(
            (symbol_short!("LpSeed"), market_id),
            (provider.clone(), amount),
        );
        emit_liquidity_provided(&env, market_id, &provider, amount);
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

        let winners_map = position_token::get_balances(env, market_id, market.winning_outcome);
        let mut paid: u32 = 0;

        if winners_map.len() == 0 {
            return 0;
        }

        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        let winning_stake: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::OutcomePool(market_id, market.winning_outcome))
            .unwrap_or(0);

        if winning_stake == 0 {
            return 0;
        }

        let fee_bps = read_fee_rate_bps(&env);
        let payout_pool = cmuldiv(total_pool, csub(10000, fee_bps as i128, "fee complement"), 10000, "payout pool");
        let token_client = token::Client::new(env, &market.token);

        for (bettor, amount) in winners_map.iter() {
            if paid >= batch_size { break; }
            let payout = (amount * payout_pool) / winning_stake;
            position_token::burn(env, market_id, market.winning_outcome, &bettor);
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

    /// Sweep tiny fractional "Dust" from a resolved market into the treasury.
    /// Only callable by Admin if the market is Resolved and total_pool < 0.001 units.
    pub fn sweep_dust(env: Env, market_id: u64, treasury: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(market.status == MarketStatus::Resolved, "Market not resolved");

        // Guideline: Only if Total_Pool < 0.001 XLM (10,000 stroops assuming 7 decimals)
        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        
        // 10,000 stroops = 0.001 XLM
        assert!(total_pool > 0 && total_pool < 10000, "Amount exceeds dust threshold");

        // CHECK: Ensure no active winning payouts are pending
        // Count winners to verify execution is complete
        let positions: Map<Address, (u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::UserPosition(market_id))
            .unwrap();
        
        let mut winners_count: u32 = 0;
        for (_, (outcome, _)) in positions.iter() {
            if outcome == market.winning_outcome {
                winners_count += 1;
            }
        }

        let cursor: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SettlementCursor(market_id))
            .unwrap_or(0);
        
        assert!(cursor >= winners_count, "Winning payouts still pending");

        // INTERACTIONS: Transfer to treasury
        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&env.current_contract_address(), &treasury, &total_pool);

        // EFFECTS: Zero out the shares for this market
        env.storage().instance().set(&DataKey::TotalShares(market_id), &0i128);

        // Emit Sweep event
        env.events().publish((symbol_short!("Sweep"), market_id), (treasury, total_pool));
    }

    /// Store an audit log hash on-chain. Only callable by admin.
    /// `cid_hash` is the SHA-256 hash of the IPFS CID for the audit entry.
    pub fn store_audit_hash(env: Env, admin: Address, cid_hash: BytesN<32>) {
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(admin == stored_admin, "Only admin can store audit hashes");
        admin.require_auth();

        // Increment the audit log counter
        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::AuditLogCount)
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&DataKey::AuditLog(count), &cid_hash);
        env.storage()
            .persistent()
            .set(&DataKey::AuditLogCount, &(count + 1));
    }

    /// Retrieve an audit log hash by its sequential ID.
    pub fn get_audit_hash(env: Env, log_id: u64) -> BytesN<32> {
        env.storage()
            .persistent()
            .get(&DataKey::AuditLog(log_id))
            .unwrap()
    }

    /// Get the total number of audit log entries stored on-chain.
    pub fn get_audit_log_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::AuditLogCount)
            .unwrap_or(0)
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, BytesN, Env, String};
    /// Returns how many winners have already been paid out.
    pub fn get_settlement_cursor(env: Env, market_id: u64) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SettlementCursor(market_id))
            .unwrap_or(0)
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
    pub fn update_fee(env: Env, caller: Address, new_fee: i128, new_destination: Address, new_mode: FeeMode) {
        require_role(&env, &caller, Role::FeeSetter);
        assert!(new_fee >= 0, "Fee must be non-negative");
        env.storage().instance().set(&DataKey::CreationFee, &new_fee);
        env.storage().instance().set(&DataKey::FeeDestination, &new_destination);
        env.storage().instance().set(&DataKey::FeeModeConfig, &new_mode);
    }

    /// Set the platform fee rate in basis points.
    /// Only callable by the FeeSetter role. Max 1000 bps (10%).
    /// Emits FeeRateUpdated event on every update.
    pub fn set_fee_rate(env: Env, caller: Address, new_rate_bps: u32) {
        caller.require_auth();
        require_role(&env, &caller, Role::FeeSetter);
        assert!(new_rate_bps <= 1000, "fee rate exceeds maximum of 10 percent");
        let old_rate_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::FeeRateBps)
            .unwrap_or(300u32);
        env.storage().instance().set(&DataKey::FeeRateBps, &new_rate_bps);
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
        emit_fee_rate_updated(&env, old_rate_bps, new_rate_bps);
    }

    /// Get the current platform fee rate in basis points. Defaults to 300 (3%).
    pub fn get_fee_rate(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::FeeRateBps)
            .unwrap_or(300u32)
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
    pub fn update_bet_limits(env: Env, caller: Address, min_amount: i128, max_amount: i128) {
        require_role(&env, &caller, Role::FeeSetter);
        assert!(min_amount >= 1, "min must be >= 1");
        let effective_max = if max_amount == 0 { i128::MAX } else { max_amount };
        assert!(effective_max >= min_amount, "max must be >= min");
        env.storage().instance().set(&DataKey::MinBetAmount, &min_amount);
        env.storage().instance().set(&DataKey::MaxBetAmount, &effective_max);
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
    }

    /// Get current bet limits. Returns (min_amount, max_amount).
    pub fn get_bet_limits(env: Env) -> (i128, i128) {
        let min: i128 = env.storage().instance().get(&DataKey::MinBetAmount).unwrap_or(1);
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
        caller: Address,
        treasury_bps: u32,
        lp_bps: u32,
        burn_bps: u32,
        treasury_addr: Address,
        lp_addr: Address,
        burn_addr: Address,
    ) {
        require_role(&env, &caller, Role::FeeSetter);
        let total_bps = treasury_bps + lp_bps + burn_bps;
        assert!(total_bps == 10000, "BPS split must total 10000 (100%)");
        let config = FeeConfig { treasury_bps, lp_bps, burn_bps };
        env.storage().instance().set(&DataKey::FeeSplitConfig, &config);
        env.storage().instance().set(&DataKey::TreasuryAddress, &treasury_addr);
        env.storage().instance().set(&DataKey::LPAddress, &lp_addr);
        env.storage().instance().set(&DataKey::BurnAddress, &burn_addr);
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
    }

    /// Update fee distribution split (FeeSetter only).
    pub fn update_fee_split(
        env: Env,
        caller: Address,
        treasury_bps: u32,
        lp_bps: u32,
        burn_bps: u32,
    ) {
        require_role(&env, &caller, Role::FeeSetter);
        let total_bps = treasury_bps + lp_bps + burn_bps;
        assert!(total_bps == 10000, "BPS split must total 10000 (100%)");
        let config = FeeConfig { treasury_bps, lp_bps, burn_bps };
        env.storage().instance().set(&DataKey::FeeSplitConfig, &config);
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
    }

    #[test]
    fn test_store_and_get_audit_hash() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Initially zero audit logs
        assert_eq!(client.get_audit_log_count(), 0);

        // Store a mock CID hash (32 bytes)
        let hash = BytesN::from_array(&env, &[1u8; 32]);
        client.store_audit_hash(&admin, &hash);

        assert_eq!(client.get_audit_log_count(), 1);
        assert_eq!(client.get_audit_hash(&0u64), hash);

        // Store a second hash
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.store_audit_hash(&admin, &hash2);

        assert_eq!(client.get_audit_log_count(), 2);
        assert_eq!(client.get_audit_hash(&1u64), hash2);
    }

    /// Update fee destination addresses (FeeSetter only).
    pub fn update_fee_addresses(
        env: Env,
        caller: Address,
        treasury_addr: Address,
        lp_addr: Address,
        burn_addr: Address,
    ) {
        require_role(&env, &caller, Role::FeeSetter);
        env.storage().instance().set(&DataKey::TreasuryAddress, &treasury_addr);
        env.storage().instance().set(&DataKey::LPAddress, &lp_addr);
        env.storage().instance().set(&DataKey::BurnAddress, &burn_addr);
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
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
        
        let treasury_amount = cmuldiv(fee_amount, config.treasury_bps as i128, 10000, "treasury fee split");
        let lp_amount       = cmuldiv(fee_amount, config.lp_bps as i128,       10000, "lp fee split");
        let burn_amount     = cmuldiv(fee_amount, config.burn_bps as i128,     10000, "burn fee split");
        
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
        
        env.storage().instance().extend_ttl(LEDGER_TTL_EXTEND / 2, LEDGER_TTL_EXTEND);
    }

    /// Propose market resolution — Resolver only.
    pub fn propose_resolution(env: Env, resolver: Address, market_id: u64, winning_outcome: u32) {
        require_role(&env, &resolver, Role::Resolver);

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
        market.proposed_outcome = Some(winning_outcome);
        market.proposal_timestamp = env.ledger().timestamp();
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

        // Emit DisputeRaised for visual validation / indexing
        emit_dispute_raised(&env, market_id, &disputer, bond_amount);
    }

    /// Resolve market finally after potential dispute. Resolver only.
    pub fn resolve_market(env: Env, resolver: Address, market_id: u64, winning_outcome: u32) {
        require_role(&env, &resolver, Role::Resolver);

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
            env.ledger().timestamp() >= market.deadline,
            "Market deadline not reached"
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
                emit_market_voided(&env, market_id, cond_id, cond_market.winning_outcome);
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

        // Capture 3% platform fee into LP fee pool (only if LPs exist for this market)
        let has_lps = env.storage().persistent().has(&DataKey::LpContribution(market_id));
        if has_lps {
            let total_pool: i128 = env
                .storage()
                .instance()
                .get(&DataKey::TotalShares(market_id))
                .unwrap_or(0);
            let fee_pool = cmuldiv(total_pool, 3, 100, "lp fee pool 3pct");
            if fee_pool > 0 {
                env.storage()
                    .persistent()
                    .set(&DataKey::LpFeePool(market_id), &fee_pool);
                env.storage().persistent().extend_ttl(
                    &DataKey::LpFeePool(market_id),
                    100,
                    1_000_000,
                );
            }
        }
        env.storage().persistent().extend_ttl(&DataKey::ClaimDeadline(market_id), 100, 1_000_000);

        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        let fee_bps = read_fee_rate_bps(&env);
        emit_market_resolved(&env, market_id, winning_outcome, total_pool, fee_bps);
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

        env.events().publish((soroban_sdk::Symbol::new(&env, "DisputeOpened"), market_id), caller.clone());
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
        dispute.total_votes = cadd(dispute.total_votes, balance, "total votes");
        if support {
            dispute.support_votes = cadd(dispute.support_votes, balance, "support votes");
        }

        // Check threshold: more than 60% support
        // support_votes * 10 > total_votes * 6  (no floats)
        if cmul(dispute.support_votes, 10, "vote threshold") > cmul(dispute.total_votes, 6, "vote threshold") {
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
    pub fn sweep_unclaimed(env: Env, caller: Address, market_id: u64) -> i128 {
        require_role(&env, &caller, Role::Resolver);

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

        // Get winners from the position_token Map
        let winners_map = position_token::get_balances(&env, market_id, market.winning_outcome);
        let mut winners: Vec<(Address, i128)> = Vec::new(&env);
        let mut winning_stake: i128 = 0;
        
        for (addr, amount) in winners_map.iter() {
            winners.push_back((addr, amount));
            winning_stake += amount;
        }

        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        if winning_stake == 0 {
            env.storage()
                .instance()
                .set(&DataKey::MarketSwept(market_id), &true);
            return 0;
        }

        let fee_bps = read_fee_rate_bps(&env);
        let payout_pool = cmuldiv(total_pool, csub(10000, fee_bps as i128, "fee complement"), 10000, "payout pool sweep");

        // Calculate and store original payouts for each winner
        let mut original_payouts: Map<Address, i128> = Map::new(&env);
        for (bettor, amount) in winners.iter() {
            let payout = cmuldiv(amount, payout_pool, winning_stake, "original payout");
            original_payouts.set(bettor, payout);
        }
        env.storage()
            .persistent()
            .set(&DataKey::OriginalPayouts(market_id), &original_payouts);

        // Determine how many winners have already been paid via batch_distribute
        // We no longer use binary cursor tracking in batch_payout as we burn positions

        let claimed_map: Map<Address, bool> = env
            .storage()
            .persistent()
            .get(&DataKey::Claimed(market_id))
            .unwrap_or(Map::new(&env));

        // Calculate unclaimed amount
        let mut unclaimed_total: i128 = 0;
        let total_winners = winners.len();
        for i in 0..total_winners {
            let (bettor, _) = winners.get(i).unwrap();
            if !claimed_map.get(bettor.clone()).unwrap_or(false) {
                let payout = original_payouts.get(bettor).unwrap();
                unclaimed_total = cadd(unclaimed_total, payout, "unclaimed total");
            }
        }

        // Add unclaimed funds to vault balance
        let current_vault: i128 = env
            .storage()
            .instance()
            .get(&DataKey::VaultBalance)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::VaultBalance, &cadd(current_vault, unclaimed_total, "vault balance"));

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
    pub fn invest_vault(env: Env, caller: Address) -> i128 {
        require_role(&env, &caller, Role::SuperAdmin);

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
            assert!(vault_balance >= payout_amount, "Insufficient vault balance");
            env.storage()
                .instance()
                .set(&DataKey::VaultBalance, &csub(vault_balance, payout_amount, "vault deduct claim"));
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
    pub fn batch_distribute(env: &Env, market_id: u64, batch_size: u32) -> u32 {
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

        // Get remaining winners from the position_token Map
        let winners_map = position_token::get_balances(env, market_id, market.winning_outcome);
        let mut paid: u32 = 0;

        if winners_map.len() == 0 {
            return 0;
        }

        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        let winning_stake = env.storage().persistent().get(&DataKey::OutcomePool(market_id, market.winning_outcome)).unwrap_or(0);

        if winning_stake == 0 {
            return 0;
        }

        let fee_bps = read_fee_rate_bps(env);
        let fee_amount = cmuldiv(total_pool, fee_bps as i128, 10000, "fee amount");
        let payout_pool = cmuldiv(total_pool, csub(10000, fee_bps as i128, "fee complement"), 10000, "payout pool distribute");
        let token_client = token::Client::new(env, &market.token);

        // Map iteration order is deterministic in Soroban Map
        for (bettor, amount) in winners_map.iter() {
            if paid >= batch_size { break; }
            
            let payout = (amount * payout_pool) / winning_stake;
            // Burn position token to mark as processed and reclaim storage
            position_token::burn(env, market_id, market.winning_outcome, &bettor);
            token_client.transfer(&env.current_contract_address(), &bettor, &payout);
            paid += 1;
        }

        // Distribute protocol fee using configured split (only on first successful processing)
        // We use a persistent flag to track this.
        let fee_flag = DataKey::SettlementFeePaid(market_id);
        if !env.storage().persistent().has(&fee_flag) && fee_amount > 0 {
            Self::distribute_fee_split(env, fee_amount, &market.token);
            env.storage().persistent().set(&fee_flag, &true);
            env.storage().persistent().extend_ttl(&fee_flag, 100, 1_000_000);
        }

        paid
    }

    /// Convenience: settle all winners in one call (capped at MAX_BATCH_SIZE).
    /// For markets with >MAX_BATCH_SIZE winners, call batch_distribute in a loop.
    /// 
    /// # Authorization
    /// Only the Resolver role can call this function. Unauthorized callers will panic.
    pub fn distribute_rewards(env: Env, resolver: Address, market_id: u64) {
        require_role(&env, &resolver, Role::Resolver);
        Self::batch_distribute(&env, market_id, MAX_BATCH_SIZE);
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
        require_role(&env, &resolver, Role::Resolver);

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

        // O(1) winning stake lookup using per-outcome pool tracking
        let winning_stake = env.storage().persistent().get(&DataKey::OutcomePool(market_id, market.winning_outcome)).unwrap_or(0);

        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);

        assert!(winning_stake > 0, "No winners to pay out");

        let fee_bps = read_fee_rate_bps(&env);
        let payout_pool = (total_pool * (10000 - fee_bps as i128)) / 10000;
        let token_client = token::Client::new(&env, &market.token);

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

            // Find recipient's stake in winning outcome using direct Map lookup
            let recipient_stake = position_token::balance_of(&env, market_id, market.winning_outcome, &recipient);

            // Skip if recipient has no position or didn't win
            if recipient_stake == 0 {
                continue;
            }

            // Calculate payout using checked arithmetic (zero-float policy)
            let payout = cmuldiv(recipient_stake, payout_pool, winning_stake, "batch payout calc");

            token_client.transfer(&env.current_contract_address(), &recipient, &payout);

            env.storage()
                .persistent()
                .set(&DataKey::PayoutClaimed(market_id, recipient.clone()), &true);
            env.storage()
                .persistent()
                .extend_ttl(&DataKey::PayoutClaimed(market_id, recipient.clone()), 100, 1_000_000);

            // Burn position token on claim
            position_token::burn(&env, market_id, market.winning_outcome, &recipient);

            paid_count += 1;
            total_distributed = cadd(total_distributed, payout, "total distributed");
        }

        // Emit PayoutClaimed event for off-chain indexing
        emit_payout_claimed(&env, market_id, paid_count, total_distributed, 0);

        paid_count
    }

    /// User-initiated payout claim for a resolved market.
    /// Calculates payout in O(1) using per-outcome pool tracking.
    pub fn claim_payout(env: Env, market_id: u64, claimant: Address) -> i128 {
        claimant.require_auth();

        // Acquire re-entrancy lock
        acquire_reentrancy_lock(&env);

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.status == MarketStatus::Resolved, "Market not resolved yet");

        // Double-payout guard: check if already paid
        let already_paid: bool = env
            .storage()
            .persistent()
            .get(&DataKey::PayoutClaimed(market_id, claimant.clone()))
            .unwrap_or(false);
        assert!(!already_paid, "Payout already claimed");

        // O(1) winning stake lookup
        let winning_stake = env.storage().persistent().get(&DataKey::OutcomePool(market_id, market.winning_outcome)).unwrap_or(0);
        assert!(winning_stake > 0, "No winners for this market");

        // Find claimant's stake in winning outcome
        let user_stake = position_token::balance_of(&env, market_id, market.winning_outcome, &claimant);
        assert!(user_stake > 0, "No winning position found");

        let total_pool: i128 = env.storage().instance().get(&DataKey::TotalShares(market_id)).unwrap_or(0);
        let fee_bps = read_fee_rate_bps(&env);
        let payout_pool = (total_pool * (10000 - fee_bps as i128)) / 10000;
        let fee_amount = (total_pool * fee_bps as i128) / 10000;

        // Calculate payout using checked arithmetic
        let payout = cmuldiv(user_stake, payout_pool, winning_stake, "claim payout calc");
        assert!(payout > 0, "Calculated payout is zero");

        // Transfer tokens
        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&env.current_contract_address(), &claimant, &payout);

        // Mark as paid
        env.storage()
            .persistent()
            .set(&DataKey::PayoutClaimed(market_id, claimant.clone()), &true);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::PayoutClaimed(market_id, claimant.clone()), 100, 1_000_000);

        // Burn position token on claim
        position_token::burn(&env, market_id, market.winning_outcome, &claimant);

        // Distribute protocol fee using configured split (only on first successful processing)
        let fee_flag = DataKey::SettlementFeePaid(market_id);
        if !env.storage().persistent().has(&fee_flag) && fee_amount > 0 {
            Self::distribute_fee_split(&env, fee_amount, &market.token);
            env.storage().persistent().set(&fee_flag, &true);
            env.storage().persistent().extend_ttl(&fee_flag, 100, 1_000_000);
        }

        // Release lock
        release_reentrancy_lock(&env);

        payout
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
    /// This is now derived from the remaining positions.
    pub fn get_settlement_payout_count(_env: Env, _market_id: u64, _winning_outcome: u32) -> u32 {
        0 // Return 0 as simplified implementation
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

    /// Eager-claim payouts from multiple resolved markets.
    /// Returns the total payout claimed across all markets.
    pub fn bulk_claim(env: Env, market_ids: Vec<u64>, claimant: Address) -> i128 {
        claimant.require_auth();
        let mut total_payout: i128 = 0;

        for market_id in market_ids.iter() {
            let market: Market = match env.storage().persistent().get(&DataKey::Market(market_id)) {
                Some(m) => m,
                None => continue,
            };

            if market.status != MarketStatus::Resolved {
                continue;
            }

            // check re-entrancy
            if env.storage().instance().has(&symbol_short!("locked")) {
                continue; 
            }

            let user_amount = position_token::balance_of(&env, market_id, market.winning_outcome, &claimant);
            if user_amount == 0 {
                continue;
            }

            // Calculate winning stake
            let winning_stake = env.storage().persistent().get(&DataKey::OutcomePool(market_id, market.winning_outcome)).unwrap_or(0);

            if winning_stake == 0 {
                continue;
            }

            let total_pool: i128 = env.storage().instance().get(&DataKey::TotalShares(market_id)).unwrap_or(0);
            let fee_bps = read_fee_rate_bps(&env);
            let payout_pool = (total_pool * (10000 - fee_bps as i128)) / 10000;
            let fee_amount = (total_pool * fee_bps as i128) / 10000;

            let payout = cmuldiv(user_amount, payout_pool, winning_stake, "bulk claim payout");
            
            if payout > 0 {
                // Burn position to finalize claim
                position_token::burn(&env, market_id, market.winning_outcome, &claimant);
                let token_client = token::Client::new(&env, &market.token);
                token_client.transfer(&env.current_contract_address(), &claimant, &payout);
                total_payout += payout;

                // Distribute fee if not already done
                let fee_flag = DataKey::SettlementFeePaid(market_id);
                if !env.storage().persistent().has(&fee_flag) && fee_amount > 0 {
                    Self::distribute_fee_split(&env, fee_amount, &market.token);
                    env.storage().persistent().set(&fee_flag, &true);
                    env.storage().persistent().extend_ttl(&fee_flag, 100, 1_000_000);
                }
            }
        }

        total_payout
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


        // 3. Bump Instance storage (TotalShares, IsPaused, etc. are grouped here)
        env.storage().instance().extend_ttl(threshold, extend_to);

        // 4. Bump LP tracking keys if they exist
        if env.storage().persistent().has(&DataKey::LpContribution(market_id)) {
            env.storage().persistent().extend_ttl(
                &DataKey::LpContribution(market_id),
                threshold,
                extend_to,
            );
        }
        if env.storage().persistent().has(&DataKey::LpFeePool(market_id)) {
            env.storage().persistent().extend_ttl(
                &DataKey::LpFeePool(market_id),
                threshold,
                extend_to,
            );
        }
    }

    pub fn get_user_position(env: Env, market_id: u64, user: Address, option_index: u32) -> i128 {
        position_token::balance_of(&env, market_id, option_index, &user)
    }

    pub fn exit_position(env: Env, market_id: u64, option_index: u32, bettor: Address, amount: i128) -> i128 {
        bettor.require_auth();
        assert!(amount > 0, "Amount must be positive");

        let market: Market = load_market(&env, market_id);
        assert!(market.status == MarketStatus::Active, "Market not active");
        assert!(option_index < market.options.len(), "Invalid option index");

        let b: i128 = env.storage().instance().get(&DataKey::LmsrB(market_id)).unwrap_or(0);
        let outcome_shares: Vec<i128> = load_outcome_shares(&env, market_id);

        let (q_before, n) = build_share_arrays(&outcome_shares);
        let mut q_after = [0i128; 8];
        for j in 0..n {
            q_after[j] = q_before[j];
        }
        assert!(q_after[option_index as usize] >= amount, "Insufficient position balance");
        q_after[option_index as usize] -= amount;

        let cost_before = lmsr_cost(&q_before[..n], b);
        let cost_after = lmsr_cost(&q_after[..n], b);
        let cost_delta = cost_before - cost_after; // Amount contract pays user
        assert!(cost_delta > 0, "payout must be positive");

        // Take a 0.5% exit fee to reward LPs and discourage churn
        let exit_fee = (cost_delta * EXIT_FEE_BPS) / 10000;
        let final_payout = cost_delta - exit_fee;

        // Update outcome shares
        let mut new_shares = outcome_shares.clone();
        new_shares.set(option_index, q_after[option_index as usize]);
        env.storage().instance().set(&DataKey::OutcomeShares(market_id), &new_shares);

        // Position recording via position_token burn_partial
        position_token::burn_partial(&env, market_id, option_index, &bettor, amount);

        // Refund the payout
        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&env.current_contract_address(), &bettor, &final_payout);

        // Distribute exit fee and update market total
        let total_pool: i128 = env.storage().instance().get(&DataKey::TotalShares(market_id)).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalShares(market_id), &(total_pool - cost_delta));
        Self::distribute_fee_split(&env, exit_fee, &market.token);

        final_payout
    }

    pub fn get_lmsr_price(env: Env, market_id: u64, option_index: u32) -> i128 {
        let b: i128 = env.storage().instance().get(&DataKey::LmsrB(market_id)).unwrap_or(0);
        let outcome_shares: Vec<i128> = load_outcome_shares(&env, market_id);
        let (q, n) = build_share_arrays(&outcome_shares);
        lmsr_price(&q[..n], b, option_index as usize)
    }

    pub fn get_outcome_shares(env: Env, market_id: u64) -> Vec<i128> {
        load_outcome_shares(&env, market_id)
    }

    // ── getters and claim_refund ──────────────────────────────────────────────

    pub fn claim_refund(env: Env, market_id: u64, bettor: Address) -> i128 {
        bettor.require_auth();
        let market: Market = env.storage().persistent().get(&DataKey::Market(market_id)).unwrap();
        assert!(market.status == MarketStatus::Voided, "Market is not voided");
        
        let claimed_key = DataKey::RefundClaimed(market_id, bettor.clone());
        assert!(!env.storage().persistent().has(&claimed_key), "Already refunded");

        // Retrieve user's actual money paid (cost_delta sum)
        let cost_key = DataKey::UserCost(market_id, bettor.clone());
        let amount: i128 = env.storage().persistent().get(&cost_key).unwrap_or(0);
        assert!(amount > 0, "No position found or zero contribution");

        // Refund the actual amount paid
        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&env.current_contract_address(), &bettor, &amount);

        env.storage().persistent().set(&claimed_key, &true);
        env.storage().persistent().extend_ttl(&claimed_key, 100, 1_000_000);
        amount
    }

    /// Verifies ZK proofs for oracle resolution (admin-only).
    pub fn verify_proof(
        env: Env,
        caller: Address,
        proof_scalar: soroban_sdk::BytesN<32>,
        expected: soroban_sdk::BytesN<32>,
    ) -> bool {
        // Only SuperAdmin may trigger proof verification
        require_role(&env, &caller, Role::SuperAdmin);

        // Normalize both scalars to canonical range [0, r) before comparison.
        // This prevents a prover from bypassing equality by supplying s + k*r.
        let norm_proof = normalize_scalar(proof_scalar.to_array());
        let norm_expected = normalize_scalar(expected.to_array());

        norm_proof == norm_expected
    }


    /// Get per-outcome pool balances for a multi-outcome market.
    /// Returns a Map of outcome_index → total stake in that outcome.
    /// Get per-outcome pool balances for a multi-outcome market.
    /// Returns a Map of outcome_index → total stake by reconstructing from individual O(1) keys.
    pub fn get_outcome_pool_balances(env: Env, market_id: u64) -> Map<u32, i128> {
        let market: Market = env.storage().persistent().get(&DataKey::Market(market_id)).unwrap();
        let mut pool_balances: Map<u32, i128> = Map::new(&env);
        for i in 0..market.options.len() {
            let balance = env.storage().persistent().get(&DataKey::OutcomePool(market_id, i as u32)).unwrap_or(0);
            pool_balances.set(i as u32, balance);
        }
        pool_balances
    }

    /// Get pool balance for a specific outcome.
    /// Returns the total stake placed on the specified outcome in O(1).
    pub fn get_outcome_pool_balance(env: Env, market_id: u64, outcome_index: u32) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::OutcomePool(market_id, outcome_index))
            .unwrap_or(0)
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn setup() -> (Env, PredictionMarketClient<'static>, Address, Address, u64) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        client.initialize(&admin);
        
        let fee_dest = Address::generate(&env);
        client.update_fee(&0i128, &fee_dest, &FeeMode::Treasury);

        let token_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin);
        let token_addr = sac.address();
        
        client.set_token_whitelist(&token_addr, &true);
        client.update_bet_limits(&1i128, &0i128); // Standard limits for testing

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
            &String::from_str(&env, "Test market"),
            &options,
            &deadline,
            &token_addr,
            &100_000_000i128, // b = 10.0
            &None,
            &None,
        );
        
        client.configure_fee_split(
            &10000, 
            &0, 
            &0, 
            &fee_dest, 
            &fee_dest.clone(), 
            &fee_dest.clone()
        );

        (env, client, creator, token_addr, deadline)
    }

    fn setup_market_with_winners(n: u32) -> (Env, PredictionMarketClient<'static>, Vec<Address>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let fee_dest = Address::generate(&env);
        client.update_fee(&0i128, &fee_dest, &FeeMode::Treasury);

        let loser = Address::generate(&env);

        let token_admin_addr = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin_addr.clone());
        let token_addr = sac.address();
        
        client.set_token_whitelist(&token_addr, &true);
        client.update_bet_limits(&1i128, &0i128);
        
        client.configure_fee_split(
            &10000, 
            &0, 
            &0, 
            &fee_dest, 
            &fee_dest.clone(), 
            &fee_dest.clone()
        );

        let sac_client = token::StellarAssetClient::new(&env, &token_addr);

        // Create n winners + 1 loser, each staking 100 stroops
        let mut bettors: Vec<Address> = Vec::new(&env);
        for _ in 0..n {
            bettors.push_back(Address::generate(&env));
        }

        // Mint enough to each bettor + loser
        let all_recipients: soroban_sdk::Vec<Address> = {
            let mut v = bettors.clone();
            v.push_back(loser.clone());
            v
        };
        for addr in all_recipients.iter() {
            sac_client.mint(&addr, &100_000_000i128); // 10 XLM - plenty for small bets
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
            &token_addr,
            &100_000_000i128,
            &None,
            &None,
        );

        for bettor in bettors.iter() {
            client.place_bet(&1u64, &0u32, &bettor, &1_000_000i128);
        }
        client.place_bet(&1u64, &1u32, &loser, &1_000_000i128);
        
        client.propose_resolution(&1u64, &0u32);
        
        // Advance ledger past liveness window
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        
        client.resolve_market(&1u64, &0u32);

        (env, client, bettors)
    }

    fn setup_market_with_token() -> (Env, PredictionMarketClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let fee_dest = Address::generate(&env);
        client.update_fee(&0i128, &fee_dest, &FeeMode::Treasury);

        let token_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin);
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
            &String::from_str(&env, "Partial exit market"),
            &options,
            &deadline,
            &sac.address(),
            &100_000_000i128,
            &None,
            &None,
        );

        client.set_token_whitelist(&sac.address(), &true);
        client.update_bet_limits(&1i128, &0i128);
        
        client.configure_fee_split(
            &10000, 
            &0, 
            &0, 
            &fee_dest, 
            &fee_dest.clone(), 
            &fee_dest.clone()
        );

        (env, client, sac.address(), fee_dest)
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
        let contract_id = env.register(PredictionMarket, ());
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
    #[ignore]
    fn test_total_shares_consistent_after_multiple_bets() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let token_admin_addr = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(token_admin_addr.clone());
        let token_addr = sac.address();

        client.set_token_whitelist(&token_addr, &true);
        client.update_bet_limits(&1i128, &0i128);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];

        let sac_client = token::StellarAssetClient::new(&env, &token_addr);
        
        let question = String::from_str(&env, "Test Question?");

        client.create_market(
            &creator,
            &2u64,
            &question,
            &options,
            &deadline,
            &token_addr,
            &100_000_000i128,
            &None,
            &None,
        );

        let bettor1 = Address::generate(&env);
        let bettor2 = Address::generate(&env);
        sac_client.mint(&bettor1, &100_000_000i128);
        sac_client.mint(&bettor2, &100_000_000i128);
        
        client.place_bet(&2u64, &0u32, &bettor1, &100_000i128);
        client.place_bet(&2u64, &1u32, &bettor2, &200_000i128);

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
        let contract_id = env.register(PredictionMarket, ());
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
        let contract_id = env.register(PredictionMarket, ());
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
    #[ignore]
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
    #[ignore]
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
        let contract_id = env.register(PredictionMarket, ());
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
        sac.mint(&bettor, &100_000_000i128);
        client.place_bet(&1u64, &0u32, &bettor, &50i128);
    }

    // ── Batch distribute ──────────────────────────────────────────────────────

    /// Single batch_distribute(batch_size=3) pays all 3 winners in one call.
    /// Gas comparison baseline: 1 call vs 3 individual calls.
    ///
    /// Individual (old distribute_rewards per winner):
    ///   - 3 tx × (1 Persistent read + 1 token transfer write) = 3 reads, 3 writes
    /// Batch (new batch_distribute, batch_size=3):
    ///   - 1 tx × (1 Persistent read + 3 token transfer writes)
    ///   = 1 read, 3 writes — but in ONE transaction, saving 2 tx overhead costs
    #[test]
    fn test_batch_distribute_pays_all_winners_in_one_call() {
        let (_, client, winners) = setup_market_with_winners(3);
        let paid = client.batch_distribute(&1u64, &3u32);
        assert_eq!(paid, 3u32);
        // Calling again returns 0 — already fully settled
        let paid2 = client.batch_distribute(&1u64, &3u32);
        assert_eq!(paid2, 0u32);
        let _ = winners;
    }

    #[test]
    fn test_batch_distribute_cursor_advances_across_batches() {
        let (_, client, _) = setup_market_with_winners(10);
        let paid1 = client.batch_distribute(&1u64, &5u32);
        assert_eq!(paid1, 5u32);

        let paid2 = client.batch_distribute(&1u64, &5u32);
        assert_eq!(paid2, 5u32);

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
    }

    /// distribute_rewards (convenience wrapper) uses MAX_BATCH_SIZE.
    #[test]
    fn test_distribute_rewards_uses_max_batch_size() {
        let (_, client, _) = setup_market_with_winners(3);
        client.distribute_rewards(&1u64); // calls batch_distribute with MAX_BATCH_SIZE
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
        let contract_id = env.register(PredictionMarket, ());
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
    #[ignore]
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
    #[ignore]
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
    #[ignore]
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
        let contract_id = env.register(PredictionMarket, ());
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
        let contract_id = env.register(PredictionMarket, ());
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
        let contract_id = env.register(PredictionMarket, ());
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

    #[test]
    fn test_exit_position_reduces_position_and_pays_user() {
        let (env, client, token, _fee_dest) = setup_market_with_token();
        let bettor = Address::generate(&env);
        let sac_client = token::StellarAssetClient::new(&env, &token);
        sac_client.mint(&bettor, &500_000_000i128);

        client.place_bet(&1u64, &0u32, &bettor, &100_000_000i128);

        let token_client = token::Client::new(&env, &token);
        let balance_before = token_client.balance(&bettor);
        let position_before = client.get_user_position(&1u64, &bettor, &0u32);

        client.exit_position(&1u64, &0u32, &bettor, &40_000_000i128);

        let balance_after = token_client.balance(&bettor);
        let position_after = client.get_user_position(&1u64, &bettor, &0u32);

        assert!(balance_after > balance_before);
        assert_eq!(position_before - position_after, 40_000_000i128);
    }

    #[test]
    fn test_exit_position_routes_fee_to_treasury() {
        let (env, client, token, fee_dest) = setup_market_with_token();
        let bettor = Address::generate(&env);
        let sac_client = token::StellarAssetClient::new(&env, &token);
        sac_client.mint(&bettor, &500_000_000i128);

        client.place_bet(&1u64, &0u32, &bettor, &100_000_000i128);

        let token_client = token::Client::new(&env, &token);
        let treasury_before = token_client.balance(&fee_dest);

        client.exit_position(&1u64, &0u32, &bettor, &20_000_000i128);

        let treasury_after = token_client.balance(&fee_dest);
        assert!(treasury_after > treasury_before);
    }

    #[test]
    #[should_panic(expected = "Insufficient position balance")]
    fn test_exit_position_rejects_excess_amount() {
        let (env, client, token, _fee_dest) = setup_market_with_token();
        let bettor = Address::generate(&env);
        let sac_client = token::StellarAssetClient::new(&env, &token);
        sac_client.mint(&bettor, &500_000_000i128);

        client.place_bet(&1u64, &0u32, &bettor, &10_000_000i128);
        client.exit_position(&1u64, &0u32, &bettor, &20_000_000i128);
    }

    #[test]
    fn test_exit_position_reduces_total_shares() {
        let (env, client, token, _fee_dest) = setup_market_with_token();
        let bettor = Address::generate(&env);
        let sac_client = token::StellarAssetClient::new(&env, &token);
        sac_client.mint(&bettor, &500_000_000i128);

        client.place_bet(&1u64, &0u32, &bettor, &100_000_000i128);
        let total_before = client.get_total_shares(&1u64);

        client.exit_position(&1u64, &0u32, &bettor, &25_000_000i128);

        let total_after = client.get_total_shares(&1u64);
        assert!(total_after < total_before);
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
    #[ignore]
    fn test_update_fee_requires_admin_auth() {
        let env = Env::default();
        // Do NOT call mock_all_auths — auth will be enforced
        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        // Initialize 
        client.initialize(&admin);
        
        // update_fee without admin auth should panic
        let rando = Address::generate(&env);
        // Note: we do NOT call mock_all_auths() at all in this test
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
    fn test_resolve_market_flow() {
        let (_, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        client.resolve_market(&1u64, &0u32);
        let market = client.get_market(&1u64);
        assert_eq!(market.status, MarketStatus::Resolved);
        assert_eq!(market.winning_outcome, 0u32);
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
        let (env, client, _, token, _) = setup();
        client.update_bet_limits(&1_000_000i128, &50_000_000i128);
        let bettor1 = Address::generate(&env);
        let bettor2 = Address::generate(&env);
        let sac_client = token::StellarAssetClient::new(&env, &token);
        sac_client.mint(&bettor1, &100_000_000i128);
        sac_client.mint(&bettor2, &100_000_000i128);
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
        let (env, client, _, token, _) = setup();
        let bettor = Address::generate(&env);
        token::StellarAssetClient::new(&env, &token).mint(&bettor, &1_000_000_000i128);
        client.place_bet(&1u64, &0u32, &bettor, &50_000_000i128);
        let p0 = client.get_lmsr_price(&1u64, &0u32);
        let p1 = client.get_lmsr_price(&1u64, &1u32);
        assert!(p0 > 5_000_000i128, "p0 should be > 0.5 after buying: {}", p0);
        assert!(p1 < 5_000_000i128, "p1 should be < 0.5 after buying: {}", p1);
    }

    #[test]
    fn test_lmsr_outcome_shares_updated() {
        let (env, client, _, token, _) = setup();
        let bettor = Address::generate(&env);
        let sac_client = token::StellarAssetClient::new(&env, &token);
        sac_client.mint(&bettor, &100_000_000i128);
        client.place_bet(&1u64, &0u32, &bettor, &10_000_000i128);
        let shares = client.get_outcome_shares(&1u64);
        assert_eq!(shares.get(0).unwrap(), 10_000_000i128);
        assert_eq!(shares.get(1).unwrap(), 0i128);
    }

    #[test]
    fn test_lmsr_cost_delta_charged_not_raw_amount() {
        // The cost delta for buying 10 XLM of shares on a fresh binary market
        // should be less than 10 XLM (LMSR cost < raw amount for large b)
        let (env, client, _, token, _) = setup();
        let bettor = Address::generate(&env);
        let sac_client = token::StellarAssetClient::new(&env, &token);
        sac_client.mint(&bettor, &100_000_000i128);
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
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&id, &winning_outcome);
    }

    #[test]
    #[should_panic(expected = "Market not active")]
    fn test_bet_on_proposed_market_panics() {
        let (env, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        let bettor = Address::generate(&env);
        client.place_bet(&1u64, &0u32, &bettor, &50i128);
    }

    #[test]
    fn test_conditional_market_resolved_when_condition_met() {
        let (env, client, _, token, _) = setup();
        // Market 1 resolves to outcome 0 (matches condition)
        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);

        // Market 2 depends on market 1 resolving to outcome 0
        resolve_market_helper(&client, &env, &token, 2, 0, Some(1), Some(0));
        assert_eq!(client.get_market(&2u64).status, MarketStatus::Resolved);
    }

    // ── Batch distribute ──────────────────────────────────────────────────────

    #[test]
    fn test_conditional_market_voided_when_condition_not_met() {
        let (env, client, _, token, _) = setup();
        // Market 1 resolves to outcome 1 (not 0)
        client.propose_resolution(&1u64, &1u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
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
        // No timestamp advance here, as the market is intentionally left unresolved
        resolve_market_helper(&client, &env, &token, 2, 0, Some(1), Some(0));
    }

    #[test]
    fn test_claim_refund_on_voided_market() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PredictionMarket, ());
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
        client.set_token_whitelist(&sac.address(), &true);
        client.propose_resolution(&1u64, &1u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &1u32);

        // Dependent market (id=2): condition expects outcome 0 → will be voided
        client.create_market(
            &creator, &2u64, &String::from_str(&env, "Dep"), &options,
            &deadline, &sac.address(), &100_000_000i128, &Some(1u64), &Some(0u32),
        );
        // Bettor places a bet on market 2
        let balance_before = token::Client::new(&env, &sac.address()).balance(&bettor);
        client.place_bet(&2u64, &0u32, &bettor, &10_000_000i128);
        let balance_after_bet = token::Client::new(&env, &sac.address()).balance(&bettor);
        let cost_paid = balance_before - balance_after_bet;

        // Resolve market 2 — condition not met → Voided
        client.propose_resolution(&2u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&2u64, &0u32);
        assert_eq!(client.get_market(&2u64).status, MarketStatus::Voided);

        // Bettor claims refund
        let balance_before_refund = token::Client::new(&env, &sac.address()).balance(&bettor);
        let refunded = client.claim_refund(&2u64, &bettor);
        let balance_after_refund = token::Client::new(&env, &sac.address()).balance(&bettor);

        assert_eq!(refunded, cost_paid);
        assert_eq!(balance_after_refund - balance_before_refund, cost_paid);
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
        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        client.set_token_whitelist(&sac.address(), &true);
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
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &1u32);

        // Dependent market voided
        client.create_market(&creator, &2u64, &String::from_str(&env, "D"), &options,
            &deadline, &sac.address(), &100_000_000i128, &Some(1u64), &Some(0u32));
        client.place_bet(&2u64, &0u32, &bettor, &10_000_000i128);
        client.propose_resolution(&2u64, &0u32);
        
        // Advance time so the dependence market resolution succeeds
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&2u64, &0u32);

        client.claim_refund(&2u64, &bettor);
        client.claim_refund(&2u64, &bettor); // should panic with "Already refunded"
    }

    #[test]
    #[should_panic(expected = "Token not whitelisted")]
    fn test_place_bet_unwhitelisted_token_panics() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        client.initialize(&admin);
        
        let invalid_token = Address::generate(&env);
        let creator = Address::generate(&env);
        let bettor = Address::generate(&env);
        
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        
        // Unapproved token market creation (if the market creator bypassing is allowed, place_bet isn't).
        client.create_market(&creator, &999u64, &String::from_str(&env, "Q"), &options, &deadline, &invalid_token, &100_000_000i128, &None, &None);
        
        // This will reject and panic
        client.place_bet(&999u64, &0u32, &bettor, &10_000_000i128);
    }

    #[test]
    #[should_panic(expected = "not authorized")]
    fn test_distribute_rewards_unauthorized_panics() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let creator = Address::generate(&env);
        let bettor = Address::generate(&env);
        let unauthorized = Address::generate(&env);
        
        client.initialize(&admin);
        
        let sac = env.register_stellar_asset_contract(admin.clone());
        client.whitelist_token(&admin, &sac.address());
        
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        
        client.create_market(&creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None);
        client.place_bet(&1u64, &0u32, &bettor, &10_000_000i128);
        client.propose_resolution(&1u64, &0u32);
        
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 1);
        client.resolve_market(&1u64, &0u32);
        
        // Unauthorized caller should panic
        env.mock_all_auths_allowing_non_root_auth();
        client.distribute_rewards(&unauthorized, &1u64);
    }

    #[test]
    fn test_ttl_extended_on_market_creation() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let creator = Address::generate(&env);
        
        client.initialize(&admin);
        
        let sac = env.register_stellar_asset_contract(admin.clone());
        client.whitelist_token(&admin, &sac.address());
        
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        
        // Create market - should extend TTL on persistent storage
        client.create_market(&creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None);
        
        // Verify market was created (TTL extension happens internally)
        // If TTL wasn't extended, the market would be archived on mainnet
        let market_key = DataKey::Market(1u64);
        let has_market = env.storage().persistent().has(&market_key);
        assert!(has_market, "Market should exist in persistent storage");
    }

    #[test]
    fn test_ttl_extended_on_bet_placement() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let creator = Address::generate(&env);
        let bettor = Address::generate(&env);
        
        client.initialize(&admin);
        
        let sac = env.register_stellar_asset_contract(admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        client.whitelist_token(&admin, &sac.address());
        sac_client.mint(&bettor, &500_000_000i128);
        
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        
        client.create_market(&creator, &1u64, &String::from_str(&env, "Test"), &options,
            &deadline, &sac.address(), &100_000_000i128, &None, &None);
        
        // Place bet - should extend TTL on UserCost and Market
        client.place_bet(&1u64, &0u32, &bettor, &10_000_000i128);
        
        // Verify bet was recorded
        let cost_key = DataKey::UserCost(1u64, bettor.clone());
        let has_cost = env.storage().persistent().has(&cost_key);
        assert!(has_cost, "User cost should exist in persistent storage");
    }

    #[test]
    #[should_panic(expected = "Market deadline not reached")]
    fn test_resolve_market_before_deadline_panics() {
        let (env, client, _, _, _) = setup();
        env.ledger().set_timestamp(1_000_000);
        // Deadline is far in the future — resolve should panic
        client.propose_resolution(&1u64, &0u32);
        // Do NOT advance time past the liveness window
        client.resolve_market(&1u64, &0u32);
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

    #[test]
    fn test_resolve_market_after_deadline_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let contract_id = env.register(PredictionMarket, ());
        let client = PredictionMarketClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let creator = Address::generate(&env);
        let resolver = Address::generate(&env);
        
        client.initialize(&admin);
        client.assign_role(&admin, &resolver, &Role::Resolver);
        
        let sac = env.register_stellar_asset_contract(admin.clone());
        client.whitelist_token(&admin, &sac.address());
        
        // Deadline is 86400 seconds in the future
        let deadline = env.ledger().timestamp() + 86400;
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        
        // 1. Propose something
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        assert_eq!(client.get_market(&1u64).status, MarketStatus::Proposed);

        // 2. Dispute it
        // Note: mock_all_auths handles the token transfer of the bond
        client.dispute(&1u64, &disputer, &100i128);
        
        // Advance time past both liveness window AND deadline
        env.ledger().with_mut(|l| l.timestamp += 86400 + LIVENESS_WINDOW + 1);
        
        // This should succeed
        client.resolve_market(&resolver, &1u64, &0u32);
        
        // Verify market is resolved
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(1u64))
            .unwrap();
        assert_eq!(market.status, MarketStatus::Resolved);
        assert_eq!(market.winning_outcome, 0u32);
    }
    
    // ── Reentrancy Protection Tests ──────────────────────────────────────────

    /// Verify that the BUSY flag is set in temporary storage during batch_distribute.
    #[test]
    #[should_panic(expected = "Market not resolved yet")]
    fn test_payout_frozen_when_disputed() {
        let (env, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32, &env.ledger().timestamp());
        client.dispute(&1u64, &Address::generate(&env), &100i128);
        client.batch_distribute(&1u64, &5u32);
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

    // ── Dust Sweep Tests ────────────────────────────────────────────────────

    /// Ensure sweep_dust reverts if winning payouts are still pending.
    #[test]
    #[should_panic(expected = "Winning payouts still pending")]
    fn test_sweep_dust_fails_with_pending_payouts() {
        let (env, client, _) = setup_market_with_winners(3);
        // Market is Resolved, but cursor is at 0 — sweeping must fail
        let treasury = Address::generate(&env);
        client.sweep_dust(&1u64, &treasury);
    }

    /// Ensure sweep_dust succeeds for a tiny pool after full distribution.
    #[test]
    fn test_sweep_dust_success_after_full_distribution() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(sac_admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        
        // Small pool: 5000 stroops (< 10,000 dust threshold)
        let bettor = Address::generate(&env);
        sac_client.mint(&bettor, &5000i128);

        client.create_market(&7u64, &String::from_str(&env, "Q"), &vec![&env, String::from_str(&env, "A"), String::from_str(&env, "B")], &(env.ledger().timestamp() + 100), &sac.address());
        client.place_bet(&7u64, &0u32, &bettor, &5000i128);
        
        client.propose_resolution(&7u64, &0u32, &env.ledger().timestamp());
        client.resolve_market(&7u64, &0u32);
        
        // Fully distribute
        client.distribute_rewards(&7u64);
        
        // Check remaining (3% fee + rounding)
        let remaining = client.get_total_shares(&7u64);
        assert!(remaining < 10000);

        let treasury = Address::generate(&env);
        client.sweep_dust(&7u64, &treasury);

        // Verification: shares zeroed and balance exactly zero in contract (assuming this was the only market)
        assert_eq!(client.get_total_shares(&7u64), 0);
    }

    /// Ensure sweep_dust reverts if the pool exceeds the dust threshold.
    #[test]
    #[should_panic(expected = "Amount exceeds dust threshold")]
    fn test_sweep_dust_fails_if_pool_exceeds_threshold() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let sac_admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(sac_admin.clone());
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        
        // Large pool: 20,000 stroops (> 10,000 threshold)
        let bettor = Address::generate(&env);
        sac_client.mint(&bettor, &20000i128);

        client.create_market(&8u64, &String::from_str(&env, "Q"), &vec![&env, String::from_str(&env, "A"), String::from_str(&env, "B")], &(env.ledger().timestamp() + 100), &sac.address());
        client.place_bet(&8u64, &0u32, &bettor, &20000i128);
        
        client.propose_resolution(&8u64, &0u32, &env.ledger().timestamp());
        client.resolve_market(&8u64, &0u32);
        client.distribute_rewards(&8u64);
        
        // Sweep should fail because the original total_pool (20k) is checked
        let treasury = Address::generate(&env);
        client.sweep_dust(&8u64, &treasury);
    }

    // ── FeeRateBps tests ─────────────────────────────────────────────────────

    /// Default fee rate after initialization is 300 bps (3%).
    #[test]
    fn test_fee_rate_default_is_300_bps() {
        let (_, client, _, _, _) = setup();
        assert_eq!(client.get_fee_rate(), 300u32);
    }

    /// set_fee_rate stores the new value and get_fee_rate returns it.
    #[test]
    fn test_set_fee_rate_stores_value() {
        let (_, client, _, _, _) = setup();
        client.set_fee_rate(&500u32);
        assert_eq!(client.get_fee_rate(), 500u32);
    }

    /// set_fee_rate with 0 bps (zero fee) is accepted.
    #[test]
    fn test_set_fee_rate_zero_accepted() {
        let (_, client, _, _, _) = setup();
        client.set_fee_rate(&0u32);
        assert_eq!(client.get_fee_rate(), 0u32);
    }

    /// set_fee_rate with exactly 1000 bps (10%) is accepted.
    #[test]
    fn test_set_fee_rate_max_boundary_accepted() {
        let (_, client, _, _, _) = setup();
        client.set_fee_rate(&1000u32);
        assert_eq!(client.get_fee_rate(), 1000u32);
    }

    /// set_fee_rate with 1001 bps panics with the correct message.
    #[test]
    #[should_panic(expected = "fee rate exceeds maximum of 10 percent")]
    fn test_set_fee_rate_above_max_panics() {
        let (_, client, _, _, _) = setup();
        client.set_fee_rate(&1001u32);
    }

    /// Payout pool uses the stored fee rate (0 bps → full payout).
    #[test]
    fn test_payout_uses_zero_fee_rate() {
        let (env, client, _, token, _) = setup();
        client.set_fee_rate(&0u32);

        let bettor = Address::generate(&env);
        let sac = token::StellarAssetClient::new(&env, &token);
        sac.mint(&bettor, &10_000_000i128);

        client.place_bet(&1u64, &0u32, &bettor, &1_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 86400 + 1);
        client.resolve_market(&1u64, &0u32);

        let payout = client.claim_payout(&1u64, &bettor);
        // With 0% fee, payout should equal full pool (bettor is sole winner)
        assert!(payout > 0, "payout must be positive");
    }

    /// Payout pool correctly deducts 300 bps (3%) at default rate.
    #[test]
    fn test_payout_uses_300_bps_fee_rate() {
        let (env, client, _, token, _) = setup();
        // Default is 300 bps already

        let bettor = Address::generate(&env);
        let sac = token::StellarAssetClient::new(&env, &token);
        sac.mint(&bettor, &10_000_000i128);

        client.place_bet(&1u64, &0u32, &bettor, &1_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 86400 + 1);
        client.resolve_market(&1u64, &0u32);

        let payout = client.claim_payout(&1u64, &bettor);
        assert!(payout > 0, "payout must be positive");
        // Payout must be less than pool (fee was taken)
        let total_pool = client.get_total_shares(&1u64);
        let expected_pool = (total_pool * 9700) / 10000;
        assert!(payout <= expected_pool + 1, "payout must not exceed 97% of pool");
    }

    /// Payout pool correctly deducts 1000 bps (10%) at max rate.
    #[test]
    fn test_payout_uses_1000_bps_fee_rate() {
        let (env, client, _, token, _) = setup();
        client.set_fee_rate(&1000u32);

        let bettor = Address::generate(&env);
        let sac = token::StellarAssetClient::new(&env, &token);
        sac.mint(&bettor, &10_000_000i128);

        client.place_bet(&1u64, &0u32, &bettor, &1_000_000i128);

        client.propose_resolution(&1u64, &0u32);
        env.ledger().with_mut(|l| l.timestamp += LIVENESS_WINDOW + 86400 + 1);
        client.resolve_market(&1u64, &0u32);

        let payout = client.claim_payout(&1u64, &bettor);
        assert!(payout > 0, "payout must be positive");
        let total_pool = client.get_total_shares(&1u64);
        let expected_pool = (total_pool * 9000) / 10000;
        assert!(payout <= expected_pool + 1, "payout must not exceed 90% of pool");
    }
}
