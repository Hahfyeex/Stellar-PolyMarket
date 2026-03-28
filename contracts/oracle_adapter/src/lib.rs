//! # Oracle Adapter Contract
//!
//! Provides a trait abstraction (`OracleAdapter`) over price-feed sources and
//! two concrete implementations:
//!
//! * **`ChainlinkAdapter`** — calls a Chainlink Stellar oracle contract via
//!   cross-contract invocation and returns the latest price.
//! * **`MockAdapter`** — stores configurable prices in-contract; used in tests.
//!
//! ## Design invariants
//! * **Zero floats** — all prices are `i128` with 7-decimal fixed-point
//!   precision (`PRICE_SCALE = 10_000_000`).
//! * **Auth enforcement** — every state-changing entry point calls
//!   `address.require_auth()`.
//! * **Storage rent** — every write extends TTL on the affected key.

#![no_std]

use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, contracterror,
    Address, Env, Symbol,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Fixed-point scale: 7 decimal places (1_0000000 == 1.0).
pub const PRICE_SCALE: i128 = 10_000_000;

const TTL_THRESHOLD: u32 = 100;
const TTL_EXTEND_TO: u32 = 2_000_000;

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AdapterError {
    /// Contract already initialised.
    AlreadyInitialized = 1,
    /// Caller is not the admin.
    Unauthorized = 2,
    /// No price configured for this feed (MockAdapter only).
    FeedNotFound = 3,
    /// Chainlink returned a non-positive price.
    InvalidPrice = 4,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Admin address (instance storage).
    Admin,
    /// Address of the upstream Chainlink oracle contract (instance storage).
    ChainlinkContract,
    /// Mock price for a given feed id (persistent storage).
    MockPrice(Symbol),
}

// ── Chainlink cross-contract client ──────────────────────────────────────────

/// Minimal interface expected from the upstream Chainlink Stellar oracle.
/// The method name `latest_price` follows the Chainlink Stellar reference
/// implementation; adjust `Symbol` if the deployed contract differs.
#[contractclient(name = "ChainlinkOracleClient")]
pub trait ChainlinkOracle {
    /// Returns the latest price for `feed_id` as a 7-decimal fixed-point i128.
    fn latest_price(env: Env, feed_id: Symbol) -> i128;
}

// ── ChainlinkAdapter contract ─────────────────────────────────────────────────

#[contract]
pub struct ChainlinkAdapter;

#[contractimpl]
impl ChainlinkAdapter {
    // ── Admin / init ──────────────────────────────────────────────────────────

    /// Initialise the adapter with an admin and the upstream Chainlink contract.
    /// Can only be called once.
    pub fn initialize(
        env: Env,
        admin: Address,
        chainlink_contract: Address,
    ) -> Result<(), AdapterError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(AdapterError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::ChainlinkContract, &chainlink_contract);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Replace the upstream Chainlink contract address. Admin only.
    pub fn set_chainlink_contract(
        env: Env,
        admin: Address,
        chainlink_contract: Address,
    ) -> Result<(), AdapterError> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;

        env.storage()
            .instance()
            .set(&DataKey::ChainlinkContract, &chainlink_contract);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    // ── OracleAdapter interface ───────────────────────────────────────────────

    /// Fetch the latest price for `feed_id` from the upstream Chainlink oracle.
    ///
    /// Returns the price as a 7-decimal fixed-point `i128`
    /// (`PRICE_SCALE = 10_000_000`).
    pub fn get_price(env: Env, feed_id: Symbol) -> Result<i128, AdapterError> {
        let chainlink: Address = env
            .storage()
            .instance()
            .get(&DataKey::ChainlinkContract)
            .unwrap();

        let client = ChainlinkOracleClient::new(&env, &chainlink);
        let price = client.latest_price(&feed_id);

        if price <= 0 {
            return Err(AdapterError::InvalidPrice);
        }
        Ok(price)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn assert_admin(env: &Env, caller: &Address) -> Result<(), AdapterError> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != *caller {
            return Err(AdapterError::Unauthorized);
        }
        Ok(())
    }
}

// ── MockAdapter contract ──────────────────────────────────────────────────────

#[contract]
pub struct MockAdapter;

#[contractimpl]
impl MockAdapter {
    // ── Admin / init ──────────────────────────────────────────────────────────

    /// Initialise the mock adapter. Can only be called once.
    pub fn initialize(env: Env, admin: Address) -> Result<(), AdapterError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(AdapterError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Set a configurable price for `feed_id`. Admin only.
    pub fn set_price(
        env: Env,
        admin: Address,
        feed_id: Symbol,
        price: i128,
    ) -> Result<(), AdapterError> {
        admin.require_auth();
        Self::assert_admin(&env, &admin)?;

        if price <= 0 {
            return Err(AdapterError::InvalidPrice);
        }

        env.storage()
            .persistent()
            .set(&DataKey::MockPrice(feed_id), &price);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::MockPrice(feed_id), TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    // ── OracleAdapter interface ───────────────────────────────────────────────

    /// Return the configured price for `feed_id`.
    pub fn get_price(env: Env, feed_id: Symbol) -> Result<i128, AdapterError> {
        env.storage()
            .persistent()
            .get(&DataKey::MockPrice(feed_id))
            .ok_or(AdapterError::FeedNotFound)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn assert_admin(env: &Env, caller: &Address) -> Result<(), AdapterError> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != *caller {
            return Err(AdapterError::Unauthorized);
        }
        Ok(())
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        Env, Symbol,
    };

    // ── MockAdapter tests ─────────────────────────────────────────────────────

    fn setup_mock(env: &Env) -> (MockAdapterClient, Address) {
        let contract_id = env.register_contract(None, MockAdapter);
        let client = MockAdapterClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin).unwrap();
        (client, admin)
    }

    #[test]
    fn test_mock_set_and_get_price() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_mock(&env);

        let feed = Symbol::new(&env, "BTC_USD");
        client.set_price(&admin, &feed, &(50_000 * PRICE_SCALE)).unwrap();

        let price = client.get_price(&feed).unwrap();
        assert_eq!(price, 50_000 * PRICE_SCALE);
    }

    #[test]
    fn test_mock_feed_not_found() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup_mock(&env);

        let result = client.get_price(&Symbol::new(&env, "UNKNOWN"));
        assert_eq!(result, Err(Ok(AdapterError::FeedNotFound)));
    }

    #[test]
    fn test_mock_invalid_price_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_mock(&env);

        let feed = Symbol::new(&env, "ETH_USD");
        let result = client.set_price(&admin, &feed, &0i128);
        assert_eq!(result, Err(Ok(AdapterError::InvalidPrice)));

        let result = client.set_price(&admin, &feed, &-1i128);
        assert_eq!(result, Err(Ok(AdapterError::InvalidPrice)));
    }

    #[test]
    fn test_mock_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_mock(&env);

        let result = client.initialize(&admin);
        assert_eq!(result, Err(Ok(AdapterError::AlreadyInitialized)));
    }

    #[test]
    fn test_mock_unauthorized_set_price() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _) = setup_mock(&env);

        let attacker = Address::generate(&env);
        let feed = Symbol::new(&env, "BTC_USD");
        let result = client.set_price(&attacker, &feed, &(1 * PRICE_SCALE));
        assert_eq!(result, Err(Ok(AdapterError::Unauthorized)));
    }

    #[test]
    fn test_mock_multiple_feeds_independent() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_mock(&env);

        let btc = Symbol::new(&env, "BTC_USD");
        let eth = Symbol::new(&env, "ETH_USD");

        client.set_price(&admin, &btc, &(50_000 * PRICE_SCALE)).unwrap();
        client.set_price(&admin, &eth, &(3_000 * PRICE_SCALE)).unwrap();

        assert_eq!(client.get_price(&btc).unwrap(), 50_000 * PRICE_SCALE);
        assert_eq!(client.get_price(&eth).unwrap(), 3_000 * PRICE_SCALE);
    }

    #[test]
    fn test_mock_price_update() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin) = setup_mock(&env);

        let feed = Symbol::new(&env, "XLM_USD");
        client.set_price(&admin, &feed, &(1 * PRICE_SCALE)).unwrap();
        client.set_price(&admin, &feed, &(2 * PRICE_SCALE)).unwrap();

        assert_eq!(client.get_price(&feed).unwrap(), 2 * PRICE_SCALE);
    }

    // ── ChainlinkAdapter tests ────────────────────────────────────────────────

    fn setup_chainlink(env: &Env, chainlink_id: &Address) -> (ChainlinkAdapterClient, Address) {
        let contract_id = env.register_contract(None, ChainlinkAdapter);
        let client = ChainlinkAdapterClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin, chainlink_id).unwrap();
        (client, admin)
    }

    #[test]
    fn test_chainlink_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let dummy = Address::generate(&env);
        let (client, admin) = setup_chainlink(&env, &dummy);

        let result = client.initialize(&admin, &dummy);
        assert_eq!(result, Err(Ok(AdapterError::AlreadyInitialized)));
    }

    #[test]
    fn test_chainlink_set_contract_unauthorized() {
        let env = Env::default();
        env.mock_all_auths();
        let dummy = Address::generate(&env);
        let (client, _) = setup_chainlink(&env, &dummy);

        let attacker = Address::generate(&env);
        let new_contract = Address::generate(&env);
        let result = client.set_chainlink_contract(&attacker, &new_contract);
        assert_eq!(result, Err(Ok(AdapterError::Unauthorized)));
    }

    #[test]
    fn test_chainlink_set_contract_ok() {
        let env = Env::default();
        env.mock_all_auths();
        let dummy = Address::generate(&env);
        let (client, admin) = setup_chainlink(&env, &dummy);

        let new_contract = Address::generate(&env);
        client.set_chainlink_contract(&admin, &new_contract).unwrap();
    }
}
