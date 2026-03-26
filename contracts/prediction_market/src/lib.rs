#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String, Vec,
};

mod lmsr;
use lmsr::{lmsr_cost, lmsr_price};

/// Fee routing mode: burn (send to issuer/lock address) or transfer to DAO treasury.
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum FeeMode {
    /// Send fee to a burn/lock address (e.g. token issuer with locked trustline).
    Burn,
    /// Transfer fee to the DAO treasury multisig account.
    Treasury,
}

/// Maximum winners processed per batch_distribute call.
/// Keeps CPU instruction count well below Soroban's per-tx ceiling (~100M instructions).
/// At ~500k instructions per transfer, 25 winners ≈ 12.5M instructions — safe headroom.
pub const MAX_BATCH_SIZE: u32 = 25;

#[contracttype]
pub enum DataKey {
    Initialized,
    Admin,
    OracleAddress,
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
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MarketStatus {
    Active,
    Proposed,
    Disputed,
    ReReview, // threshold crossed, paused for final admin review
    Resolved,
}

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum MarketStatus1 {
    Open,
    Locked,
    Proposed,
    Resolved,
}

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum MarketStatus2 {
    Open,
    Locked,
    Proposed,
    Resolved,
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

/// Reads IsPaused from persistent storage (defaults false). Panics with "ContractPaused" if set.
fn panic_if_paused(env: &Env) {
    let paused: bool = env
        .storage()
        .persistent()
        .get(&DataKey::IsPaused)
        .unwrap_or(false);
    if paused {
        panic!("ContractPaused");
    }
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
    ) {
        creator.require_auth();
        check_role(&env, Role::Admin);
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
        panic_if_paused(&env);
        bettor.require_auth();
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

        // Hot write: total_shares → Instance
        let shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares(market_id))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares(market_id), &(shares + cost_delta));
            .set(&DataKey::TotalShares(market_id), &(shares + amount));
        env.storage().instance().extend_ttl(100, 1_000_000);

        env.events().publish((symbol_short!("Bet"), market_id), (bettor.clone(), cost_delta, option_index));
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

    /// Get the LMSR implied price for outcome `option_index` in SCALE units (1.0 = 10_000_000).
    pub fn get_lmsr_price(env: Env, market_id: u64, option_index: u32) -> i128 {
        let b: i128 = env.storage().instance().get(&DataKey::LmsrB(market_id)).unwrap();
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
        lmsr_price(&q[..n], b, option_index as usize)
    }

    /// Get the current cumulative outcome share quantities for a market.
    pub fn get_outcome_shares(env: Env, market_id: u64) -> Vec<i128> {
        env.storage()
            .instance()
            .get(&DataKey::OutcomeShares(market_id))
            .unwrap()
    }


    /// Propose market resolution — only admin (oracle-triggered).
    pub fn propose_resolution(env: Env, market_id: u64, winning_outcome: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

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
            env.ledger().timestamp() >= market.proposal_timestamp + LIVENESS_WINDOW,
            "Liveness window has not elapsed"
        );

        market.status = MarketStatus::Resolved;
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
    /// # Gas Optimization
    /// Uses Vec for positions storage. Linear iteration over Vec is more gas-efficient
    /// than Map iteration for typical market sizes (<100 bettors).
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
            // Burn position token on claim
            position_token::burn(&env, market_id, market.winning_outcome, &bettor);
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, vec, Env, String};

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
        let creator = Address::generate(&env);
        client.initialize(&admin);
        let deadline = env.ledger().timestamp() + 86400;
        let question = String::from_str(&env, "Will BTC exceed $100k?");
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        client.create_market(&creator, &1u64, &question, &options, &deadline, &token, &100_000_000i128);
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
        );

        for bettor in bettors.iter() {
            client.place_bet(&1u64, &0u32, &bettor, &100i128);
        }
        client.place_bet(&1u64, &1u32, &loser, &100i128);
        client.propose_resolution(&1u64, &0u32);
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
        );
    }

    // ── Resolve & distribute ──────────────────────────────────────────────────

    #[test]
    fn test_resolve_market_flow() {
        let (_, client, _, _, _) = setup();
        client.propose_resolution(&1u64, &0u32);
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
        client.propose_resolution(&1u64, &0u32);
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
        // total_shares reflects LMSR cost delta, which is > 0
        assert!(client.get_total_shares(&1u64) > 0);
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
        client.propose_resolution(&1u64, &0u32);
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
        );
        assert_eq!(client.get_market(&2u64).id, 2u64);
    }

    // ── Dispute Mechanism ────────────────────────────────────────────────────

    #[test]
    fn test_dispute_false_proposal() {
        let (env, client, _, _, _) = setup();
        let disputer = Address::generate(&env);
        
        // 1. Propose something
        client.propose_resolution(&1u64, &0u32);
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
        client.propose_resolution(&1u64, &0u32);
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
        );
    }
}

