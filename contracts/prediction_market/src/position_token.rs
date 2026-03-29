/// Position Token sub-module
///
/// Mints a non-transferable "position token" for every bet placed in a market.
/// Token symbol format: `<OUTCOME_IDX>-<MARKET_ID>` (e.g. `0-42` for YES on market 42).
///
/// ## Vault interaction
/// The main contract (Vault) holds all staked XLM/tokens.  A position token is a
/// *receipt* — it records how many shares a user owns in a specific outcome.
/// On `burn` (called during `batch_distribute`) the receipt is destroyed and the
/// Vault releases the proportional payout to the winner.
///
/// ## Non-transferability
/// Positions are stored in contract Persistent storage keyed by `(market_id, owner)`.
/// There is no `transfer` entry-point, so tokens cannot move outside the Stella
/// ecosystem until a secondary-market module is explicitly added.
use soroban_sdk::{contracttype, Address, Env, Map, String};

// ── Storage key ──────────────────────────────────────────────────────────────

/// Extends DataKey with a per-market position-token ledger.
/// Stored in Persistent storage (cold path — only touched on mint/burn).
#[contracttype]
pub enum TokenKey {
    /// Map<owner → balance> for a given (market_id, outcome_index) pair.
    Balances(u64, u32),
}

// ── Public interface ──────────────────────────────────────────────────────────

/// Mint `amount` position tokens for `owner` on `(market_id, outcome_index)`.
/// Emits a `mint` event: `("position_token", "mint", (market_id, outcome_index, owner, amount))`.
pub fn mint(env: &Env, market_id: u64, outcome_index: u32, owner: &Address, amount: i128) {
    let key = TokenKey::Balances(market_id, outcome_index);
    let mut balances: Map<Address, i128> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Map::new(env));

    let prev = balances.get(owner.clone()).unwrap_or(0);
    balances.set(owner.clone(), prev + amount);
    env.storage().persistent().set(&key, &balances);
    env.storage().persistent().extend_ttl(&key, super::LEDGER_TTL_EXTEND / 2, super::LEDGER_TTL_EXTEND);

    // Emit Mint event — visible in stellar-events log
    env.events().publish(
        (
            String::from_str(env, "position_token"),
            String::from_str(env, "mint"),
        ),
        (market_id, outcome_index, owner.clone(), amount),
    );
}

/// Burn `amount` position tokens held by `owner` for `(market_id, outcome_index)`.
/// Returns the remaining balance.
pub fn burn_partial(env: &Env, market_id: u64, outcome_index: u32, owner: &Address, amount: i128) -> i128 {
    let key = TokenKey::Balances(market_id, outcome_index);
    let mut balances: Map<Address, i128> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Map::new(env));

    let prev = balances.get(owner.clone()).unwrap_or(0);
    assert!(prev >= amount, "Not enough balance to burn");

    let new_bal = prev - amount;
    if new_bal == 0 {
        balances.remove(owner.clone());
    } else {
        balances.set(owner.clone(), new_bal);
    }
    env.storage().persistent().set(&key, &balances);
    env.storage().persistent().extend_ttl(&key, super::LEDGER_TTL_EXTEND / 2, super::LEDGER_TTL_EXTEND);

    env.events().publish(
        (
            String::from_str(env, "position_token"),
            String::from_str(env, "burn"),
        ),
        (market_id, outcome_index, owner.clone(), amount),
    );

    new_bal
}

/// Burn all position tokens held by `owner` for `(market_id, outcome_index)`.
/// Returns the burned amount (0 if the owner held no tokens).
/// Emits a `burn` event on non-zero burns.
pub fn burn(env: &Env, market_id: u64, outcome_index: u32, owner: &Address) -> i128 {
    let key = TokenKey::Balances(market_id, outcome_index);
    let mut balances: Map<Address, i128> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Map::new(env));

    let amount = balances.get(owner.clone()).unwrap_or(0);
    if amount == 0 {
        return 0;
    }

    balances.remove(owner.clone());
    env.storage().persistent().set(&key, &balances);
    env.storage().persistent().extend_ttl(&key, super::LEDGER_TTL_EXTEND / 2, super::LEDGER_TTL_EXTEND);

    env.events().publish(
        (
            String::from_str(env, "position_token"),
            String::from_str(env, "burn"),
        ),
        (market_id, outcome_index, owner.clone(), amount),
    );

    amount
}

/// Return the full balance Map for a given (market_id, outcome_index).
pub fn get_balances(env: &Env, market_id: u64, outcome_index: u32) -> Map<Address, i128> {
    let key = TokenKey::Balances(market_id, outcome_index);
    env.storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Map::new(env))
}

/// Return the position-token balance for `owner` on `(market_id, outcome_index)`.
pub fn balance_of(env: &Env, market_id: u64, outcome_index: u32, owner: &Address) -> i128 {
    let balances = get_balances(env, market_id, outcome_index);
    balances.get(owner.clone()).unwrap_or(0)
}
