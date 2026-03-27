/// events.rs — Versioned contract event schema for the prediction market.
///
/// Every state-changing function emits a structured event via `env.events().publish()`.
/// Downstream services (Mercury indexer, scraper, frontend) parse these events using
/// the topic as a discriminant and the data tuple as the payload.
///
/// # Versioning
/// Each event carries a `version: u32` field in its data payload (always first).
/// Increment the version when the payload shape changes; parsers must handle all
/// known versions gracefully.
///
/// # Precision
/// All monetary amounts are `i128` in stroops (7-decimal fixed-point, 1 XLM = 10_000_000).
/// No floats anywhere — Zero-Float Policy enforced.
///
/// # Topic layout (Soroban convention)
/// `env.events().publish((TOPIC_SYMBOL, ...discriminant_fields...), data_tuple)`
/// The first topic element is always a `Symbol` matching the event name.

use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Vec, Symbol};

// ── Event version constants ───────────────────────────────────────────────────

pub const EVENT_VERSION: u32 = 1;

// ── Typed event structs ───────────────────────────────────────────────────────
// Each struct maps 1-to-1 to a ContractEvent variant.
// `#[contracttype]` makes them XDR-serialisable for on-chain storage / event data.

/// Emitted by `initialize`.
#[contracttype]
#[derive(Clone)]
pub struct EventContractInitialized {
    pub version: u32,
    pub admin: Address,
    pub ledger_timestamp: u64,
}

/// Emitted by `create_market`.
#[contracttype]
#[derive(Clone)]
pub struct EventMarketCreated {
    pub version: u32,
    pub market_id: u64,
    pub creator: Address,
    pub question: String,
    pub options_count: u32,
    pub deadline: u64,
    pub token: Address,
    pub lmsr_b: i128,
    pub creation_fee: i128,
    pub ledger_timestamp: u64,
}

/// Emitted by `place_bet` and `place_bet_with_sig`.
#[contracttype]
#[derive(Clone)]
pub struct EventBetPlaced {
    pub version: u32,
    pub market_id: u64,
    pub bettor: Address,
    pub option_index: u32,
    /// LMSR cost delta charged (stroops). NOT the raw `amount` of shares.
    pub cost: i128,
    /// Number of shares purchased.
    pub shares: i128,
    pub ledger_timestamp: u64,
}

/// Emitted by `resolve_market` on successful resolution.
#[contracttype]
#[derive(Clone)]
pub struct EventMarketResolved {
    pub version: u32,
    pub market_id: u64,
    pub winning_outcome: u32,
    pub total_pool: i128,
    pub fee_bps: u32,
    pub ledger_timestamp: u64,
}

/// Emitted by `resolve_market` when a conditional market is voided.
#[contracttype]
#[derive(Clone)]
pub struct EventMarketVoided {
    pub version: u32,
    pub market_id: u64,
    pub condition_market_id: u64,
    pub condition_outcome_actual: u32,
    pub ledger_timestamp: u64,
}

/// Emitted by `set_paused`.
#[contracttype]
#[derive(Clone)]
pub struct EventMarketPaused {
    pub version: u32,
    pub market_id: u64,
    pub paused: bool,
    pub ledger_timestamp: u64,
}

/// Emitted by `batch_distribute` and `batch_payout` for each completed batch.
#[contracttype]
#[derive(Clone)]
pub struct EventPayoutClaimed {
    pub version: u32,
    pub market_id: u64,
    /// Number of winners paid in this batch.
    pub recipients_paid: u32,
    /// Total stroops distributed in this batch.
    pub total_distributed: i128,
    /// Cursor position after this batch (batch_distribute only; 0 for batch_payout).
    pub cursor: u32,
    pub ledger_timestamp: u64,
}

/// Emitted by `provide_liquidity`.
#[contracttype]
#[derive(Clone)]
pub struct EventLiquidityProvided {
    pub version: u32,
    pub market_id: u64,
    pub provider: Address,
    pub amount: i128,
    pub ledger_timestamp: u64,
}

/// Emitted by `claim_lp_reward`.
#[contracttype]
#[derive(Clone)]
pub struct EventLpRewardClaimed {
    pub version: u32,
    pub market_id: u64,
    pub lp: Address,
    pub reward: i128,
    pub ledger_timestamp: u64,
}

/// Emitted by `dispute`.
#[contracttype]
#[derive(Clone)]
pub struct EventDisputeRaised {
    pub version: u32,
    pub market_id: u64,
    pub disputer: Address,
    pub bond_amount: i128,
    pub ledger_timestamp: u64,
}

/// Emitted by `create_market` when a non-zero creation fee is collected.
#[contracttype]
#[derive(Clone)]
pub struct EventFeeCollected {
    pub version: u32,
    pub market_id: u64,
    pub payer: Address,
    pub fee_destination: Address,
    pub amount: i128,
    pub ledger_timestamp: u64,
}

// ── Emit helpers ──────────────────────────────────────────────────────────────
// One function per event type. Call these at the END of each state-changing fn.

pub fn emit_contract_initialized(env: &Env, admin: &Address) {
    env.events().publish(
        (symbol_short!("Init"),),
        EventContractInitialized {
            version: EVENT_VERSION,
            admin: admin.clone(),
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_market_created(
    env: &Env,
    market_id: u64,
    creator: &Address,
    question: &String,
    options_count: u32,
    deadline: u64,
    token: &Address,
    lmsr_b: i128,
    creation_fee: i128,
) {
    env.events().publish(
        (symbol_short!("MktCreate"), market_id),
        EventMarketCreated {
            version: EVENT_VERSION,
            market_id,
            creator: creator.clone(),
            question: question.clone(),
            options_count,
            deadline,
            token: token.clone(),
            lmsr_b,
            creation_fee,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_bet_placed(
    env: &Env,
    market_id: u64,
    bettor: &Address,
    option_index: u32,
    cost: i128,
    shares: i128,
) {
    env.events().publish(
        (symbol_short!("BetPlace"), market_id),
        EventBetPlaced {
            version: EVENT_VERSION,
            market_id,
            bettor: bettor.clone(),
            option_index,
            cost,
            shares,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_market_resolved(
    env: &Env,
    market_id: u64,
    winning_outcome: u32,
    total_pool: i128,
    fee_bps: u32,
) {
    env.events().publish(
        (symbol_short!("MktResolv"), market_id),
        EventMarketResolved {
            version: EVENT_VERSION,
            market_id,
            winning_outcome,
            total_pool,
            fee_bps,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_market_voided(
    env: &Env,
    market_id: u64,
    condition_market_id: u64,
    condition_outcome_actual: u32,
) {
    env.events().publish(
        (symbol_short!("MktVoid"), market_id),
        EventMarketVoided {
            version: EVENT_VERSION,
            market_id,
            condition_market_id,
            condition_outcome_actual,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_market_paused(env: &Env, market_id: u64, paused: bool) {
    env.events().publish(
        (symbol_short!("MktPause"), market_id),
        EventMarketPaused {
            version: EVENT_VERSION,
            market_id,
            paused,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_payout_claimed(
    env: &Env,
    market_id: u64,
    recipients_paid: u32,
    total_distributed: i128,
    cursor: u32,
) {
    env.events().publish(
        (symbol_short!("Payout"), market_id),
        EventPayoutClaimed {
            version: EVENT_VERSION,
            market_id,
            recipients_paid,
            total_distributed,
            cursor,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_liquidity_provided(env: &Env, market_id: u64, provider: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("LpSeed"), market_id),
        EventLiquidityProvided {
            version: EVENT_VERSION,
            market_id,
            provider: provider.clone(),
            amount,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_lp_reward_claimed(env: &Env, market_id: u64, lp: &Address, reward: i128) {
    env.events().publish(
        (symbol_short!("LpClaim"), market_id),
        EventLpRewardClaimed {
            version: EVENT_VERSION,
            market_id,
            lp: lp.clone(),
            reward,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_dispute_raised(
    env: &Env,
    market_id: u64,
    disputer: &Address,
    bond_amount: i128,
) {
    env.events().publish(
        (symbol_short!("Dispute"), market_id),
        EventDisputeRaised {
            version: EVENT_VERSION,
            market_id,
            disputer: disputer.clone(),
            bond_amount,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}

pub fn emit_fee_collected(
    env: &Env,
    market_id: u64,
    payer: &Address,
    fee_destination: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("FeeColl"), market_id),
        EventFeeCollected {
            version: EVENT_VERSION,
            market_id,
            payer: payer.clone(),
            fee_destination: fee_destination.clone(),
            amount,
            ledger_timestamp: env.ledger().timestamp(),
        },
    );
}
