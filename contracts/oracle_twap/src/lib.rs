//! # Oracle TWAP Contract
//!
//! A Soroban smart-contract that stores a **circular buffer** of price
//! observations per feed and computes a **Time-Weighted Average Price (TWAP)**
//! over any requested ledger window.
//!
//! ## Design choices
//! * **Zero floats** — all prices are `i128` with 7-decimal fixed-point
//!   precision (1 unit = 0.0000001).  The constant `PRICE_SCALE = 10_000_000`.
//! * **Circular buffer** of configurable capacity (`MAX_OBSERVATIONS`).  When
//!   the buffer is full the oldest entry is silently overwritten.
//! * **Persistent storage** for the price buffer; TTL is extended on every
//!   write so entries survive Soroban's ledger-rent eviction.
//! * **Auth enforcement** — every state-changing entry point calls
//!   `address.require_auth()` or verifies the `Oracle` role.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    Address, Env, Vec,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Fixed-point scale: 7 decimal places (e.g. 1_0000000 == 1.0)
pub const PRICE_SCALE: i128 = 10_000_000;

/// Maximum number of observations stored per feed.
/// Circular buffer wraps once this limit is reached.
pub const MAX_OBSERVATIONS: u32 = 256;

/// Minimum ledger threshold / extend-to for persistent storage rent.
const TTL_THRESHOLD: u32 = 100;
const TTL_EXTEND_TO: u32 = 2_000_000;

// ── Error codes ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OracleError {
    /// Contract has already been initialised.
    AlreadyInitialized     = 1,
    /// Caller does not hold the required role.
    Unauthorized           = 2,
    /// Price must be strictly positive.
    InvalidPrice           = 3,
    /// TWAP window must be at least 1.
    InvalidWindow          = 4,
    /// Fewer than 2 observations in the requested window.
    InsufficientObservations = 5,
    /// Arithmetic overflow during TWAP accumulation.
    ArithmeticOverflow     = 6,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Admin address (instance storage)
    Admin,
    /// Oracle operator address (instance storage)
    OracleOperator,
    /// Circular-buffer state for a given feed ID
    PriceBuf(u64),
}

// ── Data types ────────────────────────────────────────────────────────────────

/// A single price observation.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PriceObservation {
    /// Ledger sequence number at the time of recording.
    pub ledger: u32,
    /// Price in fixed-point with 7 decimal places.
    pub price: i128,
}

/// Circular-buffer wrapper stored per feed in persistent storage.
///
/// ```text
///  head ──► next write position (0-based index into `data`)
///  count ─► number of valid entries  (≤ MAX_OBSERVATIONS)
///  data  ─► Vec of up to MAX_OBSERVATIONS entries
/// ```
#[contracttype]
#[derive(Clone, Debug)]
pub struct PriceBuffer {
    pub head:  u32,
    pub count: u32,
    pub data:  Vec<PriceObservation>,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct OracleTwap;

#[contractimpl]
impl OracleTwap {
    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /// One-time initialisation. Stores `admin` and `oracle_operator`.
    ///
    /// # Errors
    /// * [`OracleError::AlreadyInitialized`] if called more than once.
    pub fn initialize(
        env:              Env,
        admin:            Address,
        oracle_operator:  Address,
    ) -> Result<(), OracleError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(OracleError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::OracleOperator, &oracle_operator);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Update the oracle operator address (admin-only).
    pub fn set_oracle_operator(
        env:      Env,
        admin:    Address,
        new_op:   Address,
    ) -> Result<(), OracleError> {
        let stored_admin: Address = env
            .storage().instance()
            .get(&DataKey::Admin)
            .ok_or(OracleError::Unauthorized)?;

        admin.require_auth();
        if admin != stored_admin {
            return Err(OracleError::Unauthorized);
        }

        env.storage().instance().set(&DataKey::OracleOperator, &new_op);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    // ── Price recording ───────────────────────────────────────────────────────

    /// Append the current `price` for `feed_id` to its circular buffer.
    ///
    /// Callable only by the registered oracle operator.
    /// The current ledger sequence number is captured automatically.
    ///
    /// # Parameters
    /// * `oracle` – must match the stored oracle-operator address.
    /// * `feed_id` – arbitrary feed identifier chosen by the operator.
    /// * `price` – strictly-positive fixed-point price (7 decimals).
    ///
    /// # Errors
    /// * [`OracleError::Unauthorized`] if `oracle` ≠ stored oracle operator.
    /// * [`OracleError::InvalidPrice`] if `price ≤ 0`.
    pub fn record_price(
        env:     Env,
        oracle:  Address,
        feed_id: u64,
        price:   i128,
    ) -> Result<(), OracleError> {
        // Auth: only the registered oracle operator may record prices.
        let stored_op: Address = env
            .storage().instance()
            .get(&DataKey::OracleOperator)
            .ok_or(OracleError::Unauthorized)?;

        oracle.require_auth();
        if oracle != stored_op {
            return Err(OracleError::Unauthorized);
        }

        if price <= 0 {
            return Err(OracleError::InvalidPrice);
        }

        let obs = PriceObservation {
            ledger: env.ledger().sequence(),
            price,
        };

        let key = DataKey::PriceBuf(feed_id);
        let mut buf: PriceBuffer = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| PriceBuffer {
                head:  0,
                count: 0,
                data:  Vec::new(&env),
            });

        Self::buf_push(&mut buf, obs);

        env.storage().persistent().set(&key, &buf);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        Ok(())
    }

    // ── TWAP query ────────────────────────────────────────────────────────────

    /// Compute the Time-Weighted Average Price for `feed_id` over the last
    /// `window_ledgers` ledgers.
    ///
    /// The formula weights each observation by the number of ledgers it was
    /// "active" (i.e. the gap to the next observation, or to the current
    /// ledger for the most recent entry):
    ///
    /// ```text
    /// TWAP = Σ (price_i × Δledger_i) / Σ Δledger_i
    /// ```
    ///
    /// Only observations whose `ledger` falls within
    /// `[current_ledger - window_ledgers, current_ledger]` are included.
    ///
    /// # Parameters
    /// * `feed_id` – the feed to query.
    /// * `window_ledgers` – width of the rolling window in ledgers (must be ≥ 1).
    ///
    /// # Returns
    /// TWAP price in fixed-point with 7 decimal places.
    ///
    /// # Errors
    /// * [`OracleError::InvalidWindow`] if `window_ledgers == 0`.
    /// * [`OracleError::InsufficientObservations`] if fewer than 2 observations
    ///   fall within the window.
    /// * [`OracleError::ArithmeticOverflow`] on internal overflow.
    pub fn get_twap(
        env:            Env,
        feed_id:        u64,
        window_ledgers: u32,
    ) -> Result<i128, OracleError> {
        if window_ledgers == 0 {
            return Err(OracleError::InvalidWindow);
        }

        let key = DataKey::PriceBuf(feed_id);
        let buf: PriceBuffer = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| PriceBuffer {
                head:  0,
                count: 0,
                data:  Vec::new(&env),
            });

        let current_ledger = env.ledger().sequence();
        // Saturating subtraction — if window > current_ledger, floor at 0.
        let window_start = current_ledger.saturating_sub(window_ledgers);

        // Collect observations in chronological order that fall within window.
        let ordered = Self::buf_collect(&env, &buf);
        let mut in_window: Vec<PriceObservation> = Vec::new(&env);
        for obs in ordered.iter() {
            if obs.ledger >= window_start {
                in_window.push_back(obs);
            }
        }

        let n = in_window.len();
        if n < 2 {
            return Err(OracleError::InsufficientObservations);
        }

        // Compute weighted sum and total weight.
        // Each segment: weight = next_ledger - this_ledger
        // Last segment: weight = current_ledger - last_ledger  (clamped ≥ 1)
        let mut weighted_sum: i128 = 0i128;
        let mut total_weight: i128 = 0i128;

        for idx in 0..n {
            let obs = in_window.get(idx).unwrap();
            let next_ledger: u32 = if idx + 1 < n {
                in_window.get(idx + 1).unwrap().ledger
            } else {
                // Last observation: use current ledger; ensure weight ≥ 1.
                if current_ledger > obs.ledger { current_ledger } else { obs.ledger + 1 }
            };

            let delta = (next_ledger.saturating_sub(obs.ledger)) as i128;
            // delta = 0 only if two consecutive observations share the same
            // ledger; skip to avoid skewing the average.
            if delta == 0 {
                continue;
            }

            weighted_sum = weighted_sum
                .checked_add(obs.price.checked_mul(delta).ok_or(OracleError::ArithmeticOverflow)?)
                .ok_or(OracleError::ArithmeticOverflow)?;
            total_weight = total_weight
                .checked_add(delta)
                .ok_or(OracleError::ArithmeticOverflow)?;
        }

        if total_weight == 0 {
            return Err(OracleError::InsufficientObservations);
        }

        Ok(weighted_sum / total_weight)
    }

    /// Return the raw observations for `feed_id` in **chronological** order.
    /// Useful for off-chain inspection / debugging.
    pub fn get_observations(env: Env, feed_id: u64) -> Vec<PriceObservation> {
        let key = DataKey::PriceBuf(feed_id);
        let buf: PriceBuffer = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| PriceBuffer {
                head:  0,
                count: 0,
                data:  Vec::new(&env),
            });
        Self::buf_collect(&env, &buf)
    }

    /// Return how many observations are currently stored for `feed_id`.
    pub fn observation_count(env: Env, feed_id: u64) -> u32 {
        let key = DataKey::PriceBuf(feed_id);
        let buf: PriceBuffer = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| PriceBuffer {
                head:  0,
                count: 0,
                data:  Vec::new(&env),
            });
        buf.count
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    /// Push a new observation into the circular buffer.
    ///
    /// Invariant:  `buf.head` is always the index of the **next write slot**.
    /// When `count < MAX_OBSERVATIONS` the buffer is growing; once full,
    /// `head` wraps and overwrites the oldest entry.
    fn buf_push(buf: &mut PriceBuffer, obs: PriceObservation) {
        let cap = MAX_OBSERVATIONS;
        let idx = buf.head;

        if (buf.data.len() as u32) <= idx {
            // Extend the underlying Vec (only happens while buffer is filling).
            buf.data.push_back(obs);
        } else {
            // Overwrite existing slot.
            buf.data.set(idx, obs);
        }

        buf.head = (idx + 1) % cap;
        if buf.count < cap {
            buf.count += 1;
        }
    }

    /// Collect buffer observations in chronological order into a new Vec.
    fn buf_collect(env: &Env, buf: &PriceBuffer) -> Vec<PriceObservation> {
        let mut out: Vec<PriceObservation> = Vec::new(env);
        let count = buf.count;
        if count == 0 {
            return out;
        }

        // If the buffer has NOT wrapped, entries run from index 0 to count-1.
        // If it HAS wrapped (count == MAX_OBSERVATIONS), oldest entry is at
        // `head` and we read count entries wrapping around.
        let start_idx = if count < MAX_OBSERVATIONS {
            0u32
        } else {
            buf.head // oldest entry
        };

        for i in 0..count {
            let idx = (start_idx + i) % MAX_OBSERVATIONS;
            if let Some(obs) = buf.data.get(idx) {
                out.push_back(obs);
            }
        }
        out
    }
}



// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, Env};

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn setup() -> (Env, OracleTwapClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, OracleTwap);
        let client = OracleTwapClient::new(&env, &contract_id);

        let admin  = Address::generate(&env);
        let oracle = Address::generate(&env);

        client.initialize(&admin, &oracle);
        (env, client, admin, oracle)
    }

    fn advance_ledger(env: &Env, by: u32) {
        env.ledger().with_mut(|li| {
            li.sequence_number += by;
        });
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_ok() {
        let (_env, _client, _admin, _oracle) = setup();
        // If we reach here without panic the contract is initialised.
    }

    #[test]
    fn test_double_initialize_err() {
        let (_env, client, admin, oracle) = setup();
        let res = client.try_initialize(&admin, &oracle);
        assert_eq!(res, Err(Ok(OracleError::AlreadyInitialized)));
    }

    #[test]
    fn test_set_oracle_operator_ok() {
        let (env, client, admin, _old_op) = setup();
        let new_op = Address::generate(&env);
        client.set_oracle_operator(&admin, &new_op);
        // Now recording with new_op should succeed.
        advance_ledger(&env, 1);
        client.record_price(&new_op, &1u64, &(100 * PRICE_SCALE));
        assert_eq!(client.observation_count(&1u64), 1);
    }

    #[test]
    fn test_set_oracle_operator_unauthorized() {
        let (env, client, _admin, _oracle) = setup();
        let attacker = Address::generate(&env);
        let new_op   = Address::generate(&env);
        let res = client.try_set_oracle_operator(&attacker, &new_op);
        assert_eq!(res, Err(Ok(OracleError::Unauthorized)));
    }

    // ── record_price ──────────────────────────────────────────────────────────

    #[test]
    fn test_record_price_ok() {
        let (env, client, _admin, oracle) = setup();
        advance_ledger(&env, 1);
        client.record_price(&oracle, &42u64, &PRICE_SCALE);
        assert_eq!(client.observation_count(&42u64), 1);
    }

    #[test]
    fn test_record_price_invalid_price_zero() {
        let (env, client, _admin, oracle) = setup();
        advance_ledger(&env, 1);
        let res = client.try_record_price(&oracle, &1u64, &0i128);
        assert_eq!(res, Err(Ok(OracleError::InvalidPrice)));
    }

    #[test]
    fn test_record_price_invalid_price_negative() {
        let (env, client, _admin, oracle) = setup();
        advance_ledger(&env, 1);
        let res = client.try_record_price(&oracle, &1u64, &(-1i128));
        assert_eq!(res, Err(Ok(OracleError::InvalidPrice)));
    }

    #[test]
    fn test_record_price_unauthorized() {
        let (env, client, _admin, _oracle) = setup();
        advance_ledger(&env, 1);
        let attacker = Address::generate(&env);
        let res = client.try_record_price(&attacker, &1u64, &PRICE_SCALE);
        assert_eq!(res, Err(Ok(OracleError::Unauthorized)));
    }

    // ── Circular buffer wrapping ──────────────────────────────────────────────

    #[test]
    fn test_buffer_fills_and_wraps() {
        let (env, client, _admin, oracle) = setup();
        env.budget().reset_unlimited();
        let feed: u64 = 99;

        // Fill the buffer completely.
        for i in 0..MAX_OBSERVATIONS {
            advance_ledger(&env, 1);
            let price = (i as i128 + 1) * PRICE_SCALE;
            client.record_price(&oracle, &feed, &price);
        }
        assert_eq!(client.observation_count(&feed), MAX_OBSERVATIONS);

        // Add one more — should overwrite the oldest entry.
        advance_ledger(&env, 1);
        let new_price = 9999 * PRICE_SCALE;
        client.record_price(&oracle, &feed, &new_price);
        // Count stays capped at MAX_OBSERVATIONS.
        assert_eq!(client.observation_count(&feed), MAX_OBSERVATIONS);

        // The observations should now contain new_price as one of the entries.
        let obs = client.get_observations(&feed);
        let contains_new = obs.iter().any(|o| o.price == new_price);
        assert!(contains_new, "newest price must appear after wrap");

        // The very first price (1 * PRICE_SCALE) should have been overwritten.
        let oldest_price_gone = obs.iter().all(|o| o.price != PRICE_SCALE);
        assert!(oldest_price_gone, "oldest price must have been overwritten");
    }

    #[test]
    fn test_buffer_oldest_overwritten_sequential() {
        // Smaller scale: use a 3-entry buffer worth of checks by writing 4 entries.
        // We cannot change MAX_OBSERVATIONS (const), but we can verify
        // wrap semantics with 257 entries (MAX_OBSERVATIONS + 1).
        let (env, client, _admin, oracle) = setup();
        env.budget().reset_unlimited();
        let feed: u64 = 7;

        // Write MAX_OBSERVATIONS + 1 entries with distinct ledger-based prices.
        for i in 0u32..=(MAX_OBSERVATIONS) {
            advance_ledger(&env, 1);
            client.record_price(&oracle, &feed, &((i as i128 + 1) * PRICE_SCALE));
        }
        assert_eq!(client.observation_count(&feed), MAX_OBSERVATIONS);

        // The oldest surviving observation must have price == 2 * PRICE_SCALE
        // (entry with i==1), because entry i==0 was overwritten.
        let obs = client.get_observations(&feed);
        let first = obs.get(0).unwrap();
        assert_eq!(first.price, 2 * PRICE_SCALE, "oldest surviving = price 2");
    }

    // ── get_twap ──────────────────────────────────────────────────────────────

    #[test]
    fn test_twap_invalid_window() {
        let (_env, client, _admin, _oracle) = setup();
        let res = client.try_get_twap(&1u64, &0u32);
        assert_eq!(res, Err(Ok(OracleError::InvalidWindow)));
    }

    #[test]
    fn test_twap_insufficient_observations_empty() {
        let (_env, client, _admin, _oracle) = setup();
        let res = client.try_get_twap(&1u64, &1000u32);
        assert_eq!(res, Err(Ok(OracleError::InsufficientObservations)));
    }

    #[test]
    fn test_twap_insufficient_observations_one_entry() {
        let (env, client, _admin, oracle) = setup();
        advance_ledger(&env, 1);
        client.record_price(&oracle, &1u64, &PRICE_SCALE);
        let res = client.try_get_twap(&1u64, &1000u32);
        assert_eq!(res, Err(Ok(OracleError::InsufficientObservations)));
    }

    #[test]
    fn test_twap_two_equal_prices() {
        // Two observations with the same price → TWAP must equal that price.
        let (env, client, _admin, oracle) = setup();
        let feed: u64 = 1;
        let price = 50_000 * PRICE_SCALE; // $50,000

        advance_ledger(&env, 10);
        client.record_price(&oracle, &feed, &price);
        advance_ledger(&env, 10);
        client.record_price(&oracle, &feed, &price);

        let twap = client.get_twap(&feed, &100u32);
        assert_eq!(twap, price, "TWAP of constant price series must equal that price");
    }

    #[test]
    fn test_twap_two_different_prices_equal_weights() {
        // Two observations each active for 10 ledgers → TWAP = (p1+p2)/2.
        let (env, client, _admin, oracle) = setup();
        let feed: u64 = 2;
        let p1 = 40_000 * PRICE_SCALE;
        let p2 = 60_000 * PRICE_SCALE;

        advance_ledger(&env, 10);
        client.record_price(&oracle, &feed, &p1);
        advance_ledger(&env, 10);
        client.record_price(&oracle, &feed, &p2);
        // After 10 more ledgers: p1 was active for 10, p2 active for 10.
        advance_ledger(&env, 10);

        let twap = client.get_twap(&feed, &30u32);
        let expected = (p1 + p2) / 2;
        // Allow ±1 unit rounding error from integer division.
        assert!(
            (twap - expected).abs() <= 1,
            "TWAP={twap} expected≈{expected}"
        );
    }

    #[test]
    fn test_twap_weighted_towards_longer_segment() {
        // p1 active for 90 ledgers, p2 active for 10 ledgers.
        // Expected TWAP ≈ (p1*90 + p2*10) / 100
        let (env, client, _admin, oracle) = setup();
        let feed: u64 = 3;
        let p1 = 10_000 * PRICE_SCALE;
        let p2 = 90_000 * PRICE_SCALE;

        advance_ledger(&env, 10);
        client.record_price(&oracle, &feed, &p1); // recorded at ledger L
        advance_ledger(&env, 90);                  // p1 active for 90
        client.record_price(&oracle, &feed, &p2); // recorded at ledger L+90
        advance_ledger(&env, 10);                  // p2 active for 10
        // current ledger = L + 100, window = 100

        let twap = client.get_twap(&feed, &100u32);
        let expected = (p1 * 90 + p2 * 10) / 100;
        assert!(
            (twap - expected).abs() <= 1,
            "TWAP={twap} expected≈{expected}"
        );
    }

    #[test]
    fn test_twap_window_excludes_old_observations() {
        // Record p1 at ledger 10, then advance far past it.
        // A narrow window should exclude p1 entirely leaving < 2 obs → error.
        let (env, client, _admin, oracle) = setup();
        let feed: u64 = 4;

        advance_ledger(&env, 10);
        client.record_price(&oracle, &feed, &(10 * PRICE_SCALE));
        advance_ledger(&env, 500); // far into the future
        client.record_price(&oracle, &feed, &(20 * PRICE_SCALE));
        // Only 1 observation in window of 10 ledgers → error.
        let res = client.try_get_twap(&feed, &5u32);
        assert_eq!(res, Err(Ok(OracleError::InsufficientObservations)));
    }

    #[test]
    fn test_twap_both_in_narrow_window() {
        // Two observations 5 ledgers apart, both inside a 10-ledger window.
        let (env, client, _admin, oracle) = setup();
        let feed: u64 = 5;
        let p1 = 100 * PRICE_SCALE;
        let p2 = 200 * PRICE_SCALE;

        advance_ledger(&env, 1);
        client.record_price(&oracle, &feed, &p1);
        advance_ledger(&env, 5);
        client.record_price(&oracle, &feed, &p2);
        advance_ledger(&env, 5);

        let twap = client.get_twap(&feed, &15u32);
        // p1 active for 5 ledgers, p2 active for 5 ledgers → average = (p1+p2)/2
        let expected = (p1 + p2) / 2;
        assert!((twap - expected).abs() <= 1, "TWAP={twap} expected≈{expected}");
    }

    #[test]
    fn test_twap_simulated_price_series() {
        // Simulate a realistic ascending price series and verify TWAP is
        // between the minimum and maximum observed price.
        let (env, client, _admin, oracle) = setup();
        let feed: u64 = 10;

        let prices: [i128; 8] = [
            95_000 * PRICE_SCALE,
            96_000 * PRICE_SCALE,
            97_500 * PRICE_SCALE,
            98_000 * PRICE_SCALE,
            99_000 * PRICE_SCALE,
            100_000 * PRICE_SCALE,
            101_000 * PRICE_SCALE,
            102_000 * PRICE_SCALE,
        ];

        for p in prices.iter() {
            advance_ledger(&env, 12);
            client.record_price(&oracle, &feed, p);
        }
        advance_ledger(&env, 12);

        let twap = client.get_twap(&feed, &200u32);
        let min_p = *prices.iter().min().unwrap();
        let max_p = *prices.iter().max().unwrap();
        assert!(twap >= min_p, "TWAP {twap} must be ≥ min price {min_p}");
        assert!(twap <= max_p, "TWAP {twap} must be ≤ max price {max_p}");
    }

    #[test]
    fn test_twap_manipulation_resistance() {
        // Simulate a price spike followed by a return to normal.
        // A spot price would show the spike; TWAP should be much closer to
        // the normal price (weighted by how long each price was held).
        let (env, client, _admin, oracle) = setup();
        let feed: u64 = 11;

        let normal   = 50_000 * PRICE_SCALE;
        let spike    = 500_000 * PRICE_SCALE;
        let post_spike = normal;

        // Normal price for 90 ledgers.
        advance_ledger(&env, 1);
        client.record_price(&oracle, &feed, &normal);
        advance_ledger(&env, 90);

        // Spike for only 2 ledgers.
        client.record_price(&oracle, &feed, &spike);
        advance_ledger(&env, 2);

        // Return to normal for 8 ledgers.
        client.record_price(&oracle, &feed, &post_spike);
        advance_ledger(&env, 8);

        let twap = client.get_twap(&feed, &101u32);
        // TWAP should be much closer to normal than to spike.
        let midpoint = (normal + spike) / 2;
        assert!(
            twap < midpoint,
            "TWAP {twap} should be much closer to normal ({normal}) than spike ({spike})"
        );
    }

    #[test]
    fn test_get_observations_chronological_order() {
        let (env, client, _admin, oracle) = setup();
        let feed: u64 = 20;

        for i in 0..5u32 {
            advance_ledger(&env, 3);
            client.record_price(&oracle, &feed, &((i as i128 + 1) * PRICE_SCALE));
        }

        let obs = client.get_observations(&feed);
        assert_eq!(obs.len(), 5);
        // Verify strict chronological order.
        for i in 1..obs.len() {
            assert!(
                obs.get(i).unwrap().ledger >= obs.get(i - 1).unwrap().ledger,
                "observations must be in non-decreasing ledger order"
            );
        }
    }

    #[test]
    fn test_multiple_feeds_independent() {
        let (env, client, _admin, oracle) = setup();

        advance_ledger(&env, 5);
        client.record_price(&oracle, &100u64, &(1_000 * PRICE_SCALE));
        client.record_price(&oracle, &200u64, &(2_000 * PRICE_SCALE));
        advance_ledger(&env, 5);
        client.record_price(&oracle, &100u64, &(1_100 * PRICE_SCALE));
        client.record_price(&oracle, &200u64, &(2_200 * PRICE_SCALE));
        advance_ledger(&env, 5);

        let twap_100 = client.get_twap(&100u64, &20u32);
        let twap_200 = client.get_twap(&200u64, &20u32);

        // Feed 200 should have roughly double the TWAP of feed 100.
        assert!(twap_200 > twap_100, "feed 200 prices are higher than feed 100");
        let ratio = twap_200 / (twap_100.max(1));
        assert!(ratio >= 1 && ratio <= 3, "ratio should be around 2, got {ratio}");
    }
}
