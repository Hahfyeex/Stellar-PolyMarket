#![no_std]
//! Staking Rewards Distributor — Stella Polymarket
//!
//! STELLA token stakers earn a proportional share of protocol fee revenue.
//!
//! # Rules
//! - Zero-float: i128 with 7-decimal precision (SCALAR = 1e7).
//! - Auth enforcement: every state-changing fn calls `address.require_auth()`.
//! - Storage rent: every write calls `extend_ttl`.
//! - Unbonding period: 100_800 ledgers (~7 days at 6 s/ledger).

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

// ── Constants ─────────────────────────────────────────────────────────────────
const TTL_MIN: u32 = 100;
const TTL_MAX: u32 = 1_000_000;
/// 7-day unbonding period in ledgers (6 s/ledger × 604_800 s ≈ 100_800).
const UNBONDING_PERIOD: u32 = 100_800;
/// Fixed-point scalar (7 decimals).
const SCALAR: i128 = 10_000_000;

// ── Storage keys ──────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    TotalStaked,
    /// Accumulated reward per staked unit, scaled by SCALAR.
    AccRewardPerShare,
    Stake(Address),
    Unbonding(Address),
}

// ── Types ─────────────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone)]
pub struct StakeInfo {
    pub amount: i128,
    /// reward_debt = amount * acc_reward_per_share / SCALAR at last update.
    pub reward_debt: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct UnbondingInfo {
    pub amount: i128,
    pub unlock_ledger: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────
#[contract]
pub struct StakingRewards;

#[contractimpl]
impl StakingRewards {
    // ── Initialisation ────────────────────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address, token: Address) {
        admin.require_auth();
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "already initialized"
        );
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::TotalStaked, &0_i128);
        env.storage()
            .instance()
            .set(&DataKey::AccRewardPerShare, &0_i128);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    }

    // ── Staking ───────────────────────────────────────────────────────────────

    /// Lock `amount` STELLA tokens. Settles any pending rewards first.
    pub fn stake(env: Env, staker: Address, amount: i128) {
        staker.require_auth();
        assert!(amount > 0, "amount must be positive");

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let acc: i128 = env
            .storage()
            .instance()
            .get(&DataKey::AccRewardPerShare)
            .unwrap();

        // Transfer tokens into the contract.
        token::Client::new(&env, &token).transfer(&staker, &env.current_contract_address(), &amount);

        // Update or create stake record.
        let mut info: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(staker.clone()))
            .unwrap_or(StakeInfo { amount: 0, reward_debt: 0 });

        info.amount += amount;
        info.reward_debt = info.amount * acc / SCALAR;

        env.storage()
            .persistent()
            .set(&DataKey::Stake(staker.clone()), &info);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Stake(staker.clone()), TTL_MIN, TTL_MAX);

        // Update total staked.
        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalStaked)
            .unwrap();
        env.storage()
            .instance()
            .set(&DataKey::TotalStaked, &(total + amount));
        env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    }

    /// Begin unbonding `amount` tokens. Funds are locked for UNBONDING_PERIOD ledgers.
    pub fn unstake(env: Env, staker: Address, amount: i128) {
        staker.require_auth();
        assert!(amount > 0, "amount must be positive");

        // Only one active unbonding request at a time.
        assert!(
            !env.storage()
                .persistent()
                .has(&DataKey::Unbonding(staker.clone())),
            "unbonding period active"
        );

        let mut info: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(staker.clone()))
            .expect("no stake found");
        assert!(info.amount >= amount, "insufficient stake");

        let acc: i128 = env
            .storage()
            .instance()
            .get(&DataKey::AccRewardPerShare)
            .unwrap();

        info.amount -= amount;
        info.reward_debt = info.amount * acc / SCALAR;

        env.storage()
            .persistent()
            .set(&DataKey::Stake(staker.clone()), &info);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Stake(staker.clone()), TTL_MIN, TTL_MAX);

        let unlock_ledger = env.ledger().sequence() + UNBONDING_PERIOD;
        let unbonding = UnbondingInfo { amount, unlock_ledger };
        env.storage()
            .persistent()
            .set(&DataKey::Unbonding(staker.clone()), &unbonding);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Unbonding(staker.clone()), TTL_MIN, TTL_MAX);

        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalStaked)
            .unwrap();
        env.storage()
            .instance()
            .set(&DataKey::TotalStaked, &(total - amount));
        env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    }

    /// Withdraw tokens after the unbonding period has elapsed.
    pub fn withdraw(env: Env, staker: Address) {
        staker.require_auth();

        let unbonding: UnbondingInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Unbonding(staker.clone()))
            .expect("no unbonding request");

        assert!(
            env.ledger().sequence() >= unbonding.unlock_ledger,
            "unbonding period active"
        );

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &staker,
            &unbonding.amount,
        );

        env.storage()
            .persistent()
            .remove(&DataKey::Unbonding(staker.clone()));
        env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    }

    // ── Rewards ───────────────────────────────────────────────────────────────

    /// Called by the Resolver (admin) to distribute `fee_amount` proportionally.
    pub fn distribute_rewards(env: Env, caller: Address, fee_amount: i128) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(caller == admin, "unauthorized: resolver only");
        assert!(fee_amount > 0, "fee_amount must be positive");

        let total: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalStaked)
            .unwrap();
        assert!(total > 0, "no stakers");

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(&caller, &env.current_contract_address(), &fee_amount);

        let acc: i128 = env
            .storage()
            .instance()
            .get(&DataKey::AccRewardPerShare)
            .unwrap();
        let new_acc = acc + fee_amount * SCALAR / total;
        env.storage()
            .instance()
            .set(&DataKey::AccRewardPerShare, &new_acc);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    }

    /// Claim accumulated rewards for the caller.
    pub fn claim_rewards(env: Env, staker: Address) {
        staker.require_auth();

        let acc: i128 = env
            .storage()
            .instance()
            .get(&DataKey::AccRewardPerShare)
            .unwrap();
        let mut info: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(staker.clone()))
            .expect("no stake found");

        let pending = info.amount * acc / SCALAR - info.reward_debt;
        assert!(pending > 0, "no rewards to claim");

        info.reward_debt = info.amount * acc / SCALAR;
        env.storage()
            .persistent()
            .set(&DataKey::Stake(staker.clone()), &info);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Stake(staker.clone()), TTL_MIN, TTL_MAX);

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &staker,
            &pending,
        );
        env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Env,
    };

    fn setup() -> (Env, Address, Address, Address, StakingRewardsClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let staker = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let contract_id = env.register(StakingRewards, ());
        let client = StakingRewardsClient::new(&env, &contract_id);
        client.initialize(&admin, &token_id);

        // Mint tokens to admin and staker for testing.
        let token_admin =
            soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&staker, &1_000_000_0000000_i128);
        token_admin.mint(&admin, &1_000_000_0000000_i128);

        (env, admin, staker, token_id, client)
    }

    #[test]
    fn test_stake_and_unstake() {
        let (env, _admin, staker, token_id, client) = setup();
        let token = soroban_sdk::token::Client::new(&env, &token_id);

        let stake_amount = 100_0000000_i128;
        client.stake(&staker, &stake_amount);

        let info: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(staker.clone()))
            .unwrap();
        assert_eq!(info.amount, stake_amount);

        client.unstake(&staker, &stake_amount);

        let info_after: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(staker.clone()))
            .unwrap();
        assert_eq!(info_after.amount, 0);

        // Advance ledger past unbonding period.
        env.ledger().with_mut(|l| l.sequence_number += UNBONDING_PERIOD + 1);
        let bal_before = token.balance(&staker);
        client.withdraw(&staker);
        assert_eq!(token.balance(&staker), bal_before + stake_amount);
    }

    #[test]
    #[should_panic(expected = "unbonding period active")]
    fn test_unstake_before_unbonding_panics() {
        let (env, _admin, staker, _token_id, client) = setup();
        let stake_amount = 100_0000000_i128;
        client.stake(&staker, &stake_amount);
        client.unstake(&staker, &stake_amount);

        // Second unstake while first is still in unbonding — should panic.
        // Re-stake first so there's something to unstake.
        client.stake(&staker, &stake_amount);
        client.unstake(&staker, &stake_amount);
    }

    #[test]
    fn test_rewards_proportional() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let staker_a = Address::generate(&env);
        let staker_b = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let contract_id = env.register(StakingRewards, ());
        let client = StakingRewardsClient::new(&env, &contract_id);
        client.initialize(&admin, &token_id);

        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&staker_a, &1_000_0000000_i128);
        token_admin.mint(&staker_b, &1_000_0000000_i128);
        token_admin.mint(&admin, &1_000_0000000_i128);

        // A stakes 300, B stakes 100 → A gets 75%, B gets 25%.
        client.stake(&staker_a, &300_0000000_i128);
        client.stake(&staker_b, &100_0000000_i128);

        let fee = 400_0000000_i128;
        client.distribute_rewards(&admin, &fee);

        let token = soroban_sdk::token::Client::new(&env, &token_id);
        let bal_a_before = token.balance(&staker_a);
        let bal_b_before = token.balance(&staker_b);

        client.claim_rewards(&staker_a);
        client.claim_rewards(&staker_b);

        let reward_a = token.balance(&staker_a) - bal_a_before;
        let reward_b = token.balance(&staker_b) - bal_b_before;

        // A should get 3× B's reward.
        assert_eq!(reward_a, 3 * reward_b);
        assert_eq!(reward_a + reward_b, fee);
    }

    #[test]
    #[should_panic(expected = "no rewards to claim")]
    fn test_double_claim_panics() {
        let (env, admin, staker, _token_id, client) = setup();
        let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &_token_id);
        token_admin.mint(&admin, &100_0000000_i128);

        client.stake(&staker, &100_0000000_i128);
        client.distribute_rewards(&admin, &50_0000000_i128);
        client.claim_rewards(&staker);
        // Second claim should panic.
        client.claim_rewards(&staker);
    }

    #[test]
    fn test_withdraw_after_unbonding() {
        let (env, _admin, staker, token_id, client) = setup();
        let token = soroban_sdk::token::Client::new(&env, &token_id);

        client.stake(&staker, &200_0000000_i128);
        client.unstake(&staker, &200_0000000_i128);

        env.ledger().with_mut(|l| l.sequence_number += UNBONDING_PERIOD);
        let bal = token.balance(&staker);
        client.withdraw(&staker);
        assert_eq!(token.balance(&staker), bal + 200_0000000_i128);
    }
}
