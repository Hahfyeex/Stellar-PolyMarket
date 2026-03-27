#![no_std]
//! Timelock Upgrade Guard — Stella Polymarket
//!
//! Enforces a mandatory 24-hour delay (≈ 17 280 ledgers at 5 s/ledger) between
//! an upgrade proposal and its execution, giving users time to exit before any
//! contract change takes effect.
//!
//! # Roles
//! - **SuperAdmin** — may call `propose_upgrade`, `execute_upgrade`, `cancel_upgrade`
//!
//! # Invariants
//! - Zero-float: no floating-point arithmetic anywhere.
//! - Auth enforcement: every state-changing function calls `address.require_auth()`.
//! - Storage rent: every persistent write calls `extend_ttl`.
//!
//! # Ledger-based timelock
//! `TIMELOCK_LEDGERS = 17_280` ≈ 24 h at a 5-second close time.
//! The unlock ledger is stored as a `u32` alongside the proposed WASM hash.

use soroban_sdk::{
    bytes, contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Approx 24 hours at 5 s/ledger.
pub const TIMELOCK_LEDGERS: u32 = 17_280;

/// Persistent storage TTL bounds (ledgers).
const TTL_MIN: u32 = 100;
const TTL_MAX: u32 = 1_000_000;

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The SuperAdmin address — Instance storage.
    Admin,
    /// Pending upgrade proposal — Persistent storage.
    Proposal,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// A pending upgrade proposal.
#[contracttype]
#[derive(Clone)]
pub struct UpgradeProposal {
    /// WASM hash of the new contract code.
    pub new_wasm_hash: BytesN<32>,
    /// Ledger sequence number at which the upgrade becomes executable.
    pub unlock_ledger: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct TimelockUpgrade;

#[contractimpl]
impl TimelockUpgrade {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// One-time setup. Stores the SuperAdmin address.
    /// Panics if already initialised.
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "already initialized"
        );
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("init"),),
            admin,
        );
    }

    // ── Propose ───────────────────────────────────────────────────────────────

    /// Propose a contract upgrade. SuperAdmin only.
    ///
    /// Stores `new_wasm_hash` and `current_ledger + TIMELOCK_LEDGERS` in
    /// Persistent storage. Overwrites any existing proposal.
    ///
    /// Emits: `("upgrade", "proposed", new_wasm_hash, unlock_ledger)`
    pub fn propose_upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) {
        Self::require_admin(&env, &caller);

        let unlock_ledger = env.ledger().sequence() + TIMELOCK_LEDGERS;
        let proposal = UpgradeProposal {
            new_wasm_hash: new_wasm_hash.clone(),
            unlock_ledger,
        };

        env.storage().persistent().set(&DataKey::Proposal, &proposal);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Proposal, TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("proposed")),
            (new_wasm_hash, unlock_ledger),
        );
    }

    // ── Execute ───────────────────────────────────────────────────────────────

    /// Execute a pending upgrade. SuperAdmin only.
    ///
    /// Panics with `"timelock active"` if `current_ledger < unlock_ledger`.
    /// On success: upgrades the contract WASM, clears the proposal, and emits
    /// `("upgrade", "executed", new_wasm_hash)`.
    pub fn execute_upgrade(env: Env, caller: Address) {
        Self::require_admin(&env, &caller);

        let proposal: UpgradeProposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal)
            .expect("no pending proposal");

        assert!(
            env.ledger().sequence() >= proposal.unlock_ledger,
            "timelock active"
        );

        let wasm_hash = proposal.new_wasm_hash.clone();

        // Clear proposal before upgrade (checks-effects-interactions)
        env.storage().persistent().remove(&DataKey::Proposal);

        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("executed")),
            wasm_hash.clone(),
        );

        env.deployer().update_current_contract_wasm(wasm_hash);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    /// Cancel a pending upgrade. SuperAdmin only.
    ///
    /// Clears the proposal and emits `("upgrade", "cancelled")`.
    /// Panics if no proposal exists.
    pub fn cancel_upgrade(env: Env, caller: Address) {
        Self::require_admin(&env, &caller);

        assert!(
            env.storage().persistent().has(&DataKey::Proposal),
            "no pending proposal"
        );

        env.storage().persistent().remove(&DataKey::Proposal);

        env.events().publish(
            (symbol_short!("upgrade"), symbol_short!("cancelled")),
            (),
        );
    }

    // ── View ──────────────────────────────────────────────────────────────────

    /// Returns the pending proposal, or None if none exists.
    pub fn get_proposal(env: Env) -> Option<UpgradeProposal> {
        env.storage().persistent().get(&DataKey::Proposal)
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    fn require_admin(env: &Env, caller: &Address) {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        assert!(*caller == admin, "AccessDenied: caller is not SuperAdmin");
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        Env,
    };

    /// Helper: deploy and initialise the contract, return (env, client, admin).
    fn setup() -> (Env, TimelockUpgradeClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TimelockUpgrade);
        let client = TimelockUpgradeClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, client, admin)
    }

    /// Build a dummy 32-byte WASM hash.
    fn dummy_hash(env: &Env, byte: u8) -> BytesN<32> {
        let mut arr = [0u8; 32];
        arr[0] = byte;
        BytesN::from_array(env, &arr)
    }

    // ── initialize ────────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_ok() {
        setup(); // no panic ⇒ pass
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_panics() {
        let (env, client, admin) = setup();
        client.initialize(&admin);
    }

    // ── propose_upgrade ───────────────────────────────────────────────────────

    #[test]
    fn test_propose_stores_proposal() {
        let (env, client, admin) = setup();
        let hash = dummy_hash(&env, 1);
        let seq_before = env.ledger().sequence();

        client.propose_upgrade(&admin, &hash);

        let proposal = client.get_proposal().expect("proposal should exist");
        assert_eq!(proposal.new_wasm_hash, hash);
        assert_eq!(proposal.unlock_ledger, seq_before + TIMELOCK_LEDGERS);
    }

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn test_propose_non_admin_panics() {
        let (env, client, _admin) = setup();
        let attacker = Address::generate(&env);
        client.propose_upgrade(&attacker, &dummy_hash(&env, 2));
    }

    #[test]
    fn test_propose_overwrites_existing_proposal() {
        let (env, client, admin) = setup();
        client.propose_upgrade(&admin, &dummy_hash(&env, 1));
        let hash2 = dummy_hash(&env, 2);
        client.propose_upgrade(&admin, &hash2);
        let proposal = client.get_proposal().unwrap();
        assert_eq!(proposal.new_wasm_hash, hash2);
    }

    // ── execute_upgrade ───────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "timelock active")]
    fn test_execute_before_timelock_panics() {
        let (env, client, admin) = setup();
        client.propose_upgrade(&admin, &dummy_hash(&env, 1));
        // Advance ledger by less than TIMELOCK_LEDGERS
        env.ledger().set_sequence_number(env.ledger().sequence() + TIMELOCK_LEDGERS - 1);
        client.execute_upgrade(&admin);
    }

    #[test]
    #[should_panic(expected = "no pending proposal")]
    fn test_execute_without_proposal_panics() {
        let (_env, client, admin) = setup();
        client.execute_upgrade(&admin);
    }

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn test_execute_non_admin_panics() {
        let (env, client, admin) = setup();
        client.propose_upgrade(&admin, &dummy_hash(&env, 1));
        env.ledger().set_sequence_number(env.ledger().sequence() + TIMELOCK_LEDGERS);
        let attacker = Address::generate(&env);
        client.execute_upgrade(&attacker);
    }

    // ── cancel_upgrade ────────────────────────────────────────────────────────

    #[test]
    fn test_cancel_clears_proposal() {
        let (env, client, admin) = setup();
        client.propose_upgrade(&admin, &dummy_hash(&env, 1));
        client.cancel_upgrade(&admin);
        assert!(client.get_proposal().is_none());
    }

    #[test]
    #[should_panic(expected = "no pending proposal")]
    fn test_cancel_without_proposal_panics() {
        let (_env, client, admin) = setup();
        client.cancel_upgrade(&admin);
    }

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn test_cancel_non_admin_panics() {
        let (env, client, admin) = setup();
        client.propose_upgrade(&admin, &dummy_hash(&env, 1));
        let attacker = Address::generate(&env);
        client.cancel_upgrade(&attacker);
    }

    // ── get_proposal ──────────────────────────────────────────────────────────

    #[test]
    fn test_get_proposal_none_when_empty() {
        let (_env, client, _admin) = setup();
        assert!(client.get_proposal().is_none());
    }

    // ── timelock boundary ─────────────────────────────────────────────────────

    #[test]
    fn test_unlock_ledger_is_current_plus_timelock() {
        let (env, client, admin) = setup();
        let seq = env.ledger().sequence();
        client.propose_upgrade(&admin, &dummy_hash(&env, 5));
        let proposal = client.get_proposal().unwrap();
        assert_eq!(proposal.unlock_ledger, seq + TIMELOCK_LEDGERS);
    }

    #[test]
    fn test_timelock_ledgers_constant_is_17280() {
        assert_eq!(TIMELOCK_LEDGERS, 17_280);
    }
}
