#![no_std]
//! Governance contract — DAO vote delegation for Stella Polymarket.
//!
//! # Features
//! - Token-weighted voting on governance proposals
//! - One-hop delegation: A can delegate to B, but B cannot re-delegate A's power
//! - Circular delegation prevention (A→B→A panics)
//! - Zero-float: all balances use i128 with 7-decimal precision (1 unit = 0.0000001)
//! - Auth enforcement: every state-changing fn calls `address.require_auth()`
//! - Storage rent: every persistent write calls `extend_ttl`

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, Map,
};

// ── TTL constants (ledgers) ───────────────────────────────────────────────────
const TTL_MIN: u32 = 100;
const TTL_MAX: u32 = 1_000_000;

// ── Storage keys ──────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Admin address — Instance storage
    Admin,
    /// Governance token address — Instance storage
    Token,
    /// Proposal metadata — Persistent storage per proposal id
    Proposal(u64),
    /// Vote cast by an address on a proposal — Persistent storage
    Vote(u64, Address),
    /// Delegation map: delegator → delegate — Persistent storage
    Delegate(Address),
    /// Running total of token power delegated TO an address — Persistent storage.
    /// Updated atomically in delegate() and undelegate() so vote() can read it in O(1).
    DelegatedPower(Address),
    /// Next proposal id counter — Instance storage
    NextId,
}

// ── Types ─────────────────────────────────────────────────────────────────────

/// Proposal status.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Rejected,
    Cancelled,
}

/// A governance proposal.
#[contracttype]
#[derive(Clone)]
pub struct Proposal {
    pub id: u64,
    /// Unix timestamp after which no new votes are accepted
    pub deadline: u64,
    /// Accumulated yes votes (i128, 7-decimal precision)
    pub yes_votes: i128,
    /// Accumulated no votes (i128, 7-decimal precision)
    pub no_votes: i128,
    pub status: ProposalStatus,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct Governance;

#[contractimpl]
impl Governance {
    // ── Initialisation ────────────────────────────────────────────────────────

    /// One-time setup. Stores admin and governance token address.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        admin.require_auth();
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "already initialized"
        );
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &0u64);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
    }

    // ── Proposal lifecycle ────────────────────────────────────────────────────

    /// Create a new proposal. Admin only.
    /// `deadline` must be strictly in the future.
    pub fn create_proposal(env: Env, caller: Address, deadline: u64) -> u64 {
        caller.require_auth();
        Self::require_admin(&env, &caller);
        assert!(
            deadline > env.ledger().timestamp(),
            "deadline must be in the future"
        );

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0);

        let proposal = Proposal {
            id,
            deadline,
            yes_votes: 0,
            no_votes: 0,
            status: ProposalStatus::Active,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(id), &proposal);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Proposal(id), TTL_MIN, TTL_MAX);

        env.storage()
            .instance()
            .set(&DataKey::NextId, &(id + 1));
        env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);

        env.events()
            .publish((symbol_short!("ProposalC"), id), (caller, deadline));

        id
    }

    // ── Delegation ────────────────────────────────────────────────────────────

    /// Delegate the caller's voting power to `to`.
    ///
    /// Rules:
    /// - `to` must not already have a delegate (max 1 hop — prevents chains)
    /// - `to` must not be the caller (self-delegation is a no-op / disallowed)
    /// - If `to` has already delegated to `caller`, that is circular → panic
    pub fn delegate(env: Env, caller: Address, to: Address) {
        caller.require_auth();

        assert!(caller != to, "cannot delegate to yourself");

        // Circular delegation check (max 1 hop):
        // If `to` has already delegated to `caller`, accepting would create A→B→A.
        if let Some(to_delegate) = Self::get_delegate_raw(&env, &to) {
            assert!(
                to_delegate != caller,
                "circular delegation detected"
            );
        }

        // Prevent chain delegation: `to` must not itself be a delegator
        // (i.e. `to` must not have an outgoing delegation).
        // This enforces max 1 hop: A→B is allowed only if B has no delegate.
        assert!(
            !env.storage()
                .persistent()
                .has(&DataKey::Delegate(to.clone())),
            "delegate chain not allowed: target already delegates to another address"
        );

        env.storage()
            .persistent()
            .set(&DataKey::Delegate(caller.clone()), &to);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Delegate(caller.clone()), TTL_MIN, TTL_MAX);

        // Update DelegatedPower for the new delegate:
        // Add the caller's token balance to the delegate's accumulated power.
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let caller_balance: i128 = token::Client::new(&env, &token).balance(&caller);

        let current_power: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::DelegatedPower(to.clone()))
            .unwrap_or(0);
        let new_power = current_power
            .checked_add(caller_balance)
            .expect("delegated power overflow");
        env.storage()
            .persistent()
            .set(&DataKey::DelegatedPower(to.clone()), &new_power);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::DelegatedPower(to.clone()), TTL_MIN, TTL_MAX);

        env.events()
            .publish((symbol_short!("Delegated"),), (caller, to));
    }

    /// Remove the caller's delegation, reclaiming their own voting power.
    pub fn undelegate(env: Env, caller: Address) {
        caller.require_auth();
        let to: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Delegate(caller.clone()))
            .expect("no active delegation");

        // Subtract caller's token balance from the former delegate's accumulated power
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let caller_balance: i128 = token::Client::new(&env, &token).balance(&caller);

        let current_power: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::DelegatedPower(to.clone()))
            .unwrap_or(0);
        // Saturating sub — power can't go below 0
        let new_power = current_power.saturating_sub(caller_balance);
        env.storage()
            .persistent()
            .set(&DataKey::DelegatedPower(to.clone()), &new_power);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::DelegatedPower(to.clone()), TTL_MIN, TTL_MAX);

        env.storage()
            .persistent()
            .remove(&DataKey::Delegate(caller.clone()));

        env.events()
            .publish((symbol_short!("Undelegat"),), caller);
    }

    // ── Voting ────────────────────────────────────────────────────────────────

    /// Cast a vote on `proposal_id`.
    ///
    /// Voting power = caller's token balance.
    /// If the caller has delegated their power to someone else, they cannot vote
    /// directly (their power is already counted via the delegate).
    /// If the caller IS a delegate for others, their effective power =
    ///   own balance + sum of all delegators' balances.
    ///
    /// Implementation note: rather than iterating all delegators (O(n)),
    /// we compute effective power as:
    ///   effective = own_balance + delegated_to_me
    /// where `delegated_to_me` is stored as a running total updated in
    /// `delegate` / `undelegate`. For simplicity in this implementation,
    /// we read the token balance of the caller and add any delegated power
    /// tracked in the DelegatedPower key.
    pub fn vote(env: Env, voter: Address, proposal_id: u64, support: bool) {
        voter.require_auth();

        // Voters who have delegated cannot vote directly
        assert!(
            !env.storage()
                .persistent()
                .has(&DataKey::Delegate(voter.clone())),
            "you have delegated your vote; undelegate first to vote directly"
        );

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found");

        assert!(
            proposal.status == ProposalStatus::Active,
            "proposal not active"
        );
        assert!(
            env.ledger().timestamp() <= proposal.deadline,
            "voting period has ended"
        );

        // Prevent double-voting
        assert!(
            !env.storage()
                .persistent()
                .has(&DataKey::Vote(proposal_id, voter.clone())),
            "already voted"
        );

        // Compute effective voting power:
        //   own balance + accumulated delegated power
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token);
        let own_balance: i128 = token_client.balance(&voter);

        let delegated: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::DelegatedPower(voter.clone()))
            .unwrap_or(0);

        // Saturating add — both values are non-negative i128
        let power = own_balance
            .checked_add(delegated)
            .expect("voting power overflow");

        assert!(power > 0, "no voting power");

        // Record vote
        env.storage()
            .persistent()
            .set(&DataKey::Vote(proposal_id, voter.clone()), &support);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Vote(proposal_id, voter.clone()), TTL_MIN, TTL_MAX);

        // Tally
        if support {
            proposal.yes_votes = proposal
                .yes_votes
                .checked_add(power)
                .expect("yes_votes overflow");
        } else {
            proposal.no_votes = proposal
                .no_votes
                .checked_add(power)
                .expect("no_votes overflow");
        }

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Proposal(proposal_id), TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("Voted"), proposal_id),
            (voter, support, power),
        );
    }

    /// Finalise a proposal after its deadline. Admin only.
    /// Sets status to Passed or Rejected based on yes > no.
    pub fn finalize(env: Env, caller: Address, proposal_id: u64) {
        caller.require_auth();
        Self::require_admin(&env, &caller);

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found");

        assert!(
            proposal.status == ProposalStatus::Active,
            "proposal not active"
        );
        assert!(
            env.ledger().timestamp() > proposal.deadline,
            "voting period not ended"
        );

        proposal.status = if proposal.yes_votes > proposal.no_votes {
            ProposalStatus::Passed
        } else {
            ProposalStatus::Rejected
        };

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Proposal(proposal_id), TTL_MIN, TTL_MAX);

        env.events().publish(
            (symbol_short!("Finalized"), proposal_id),
            proposal.status.clone(),
        );
    }

    // ── Read helpers ──────────────────────────────────────────────────────────

    pub fn get_proposal(env: Env, proposal_id: u64) -> Proposal {
        env.storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found")
    }

    pub fn get_delegate(env: Env, delegator: Address) -> Option<Address> {
        Self::get_delegate_raw(&env, &delegator)
    }

    pub fn get_delegated_power(env: Env, delegate: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::DelegatedPower(delegate))
            .unwrap_or(0)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(*caller == admin, "admin only");
    }

    fn get_delegate_raw(env: &Env, addr: &Address) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Delegate(addr.clone()))
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

    // ── Test helpers ──────────────────────────────────────────────────────────

    fn make_token(env: &Env, recipients: &[(&Address, i128)]) -> Address {
        let issuer = Address::generate(env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        let sac_client = token::StellarAssetClient::new(env, &sac.address());
        for (addr, amt) in recipients {
            sac_client.mint(addr, amt);
        }
        sac.address()
    }

    /// Spin up a governance contract with admin + token.
    /// Returns (env, client, admin, token_address).
    fn setup() -> (Env, GovernanceClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let dummy_token = make_token(&env, &[]);
        client.initialize(&admin, &dummy_token);
        (env, client, admin, dummy_token)
    }

    /// Setup with real token balances for voters.
    fn setup_with_voters(
        balances: &[i128],
    ) -> (Env, GovernanceClient<'static>, Address, Address, soroban_sdk::Vec<Address>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        let mut voters = soroban_sdk::Vec::new(&env);
        for _ in balances {
            voters.push_back(Address::generate(&env));
        }
        let mut pairs_vec: soroban_sdk::Vec<(Address, i128)> = soroban_sdk::Vec::new(&env);
        for i in 0..balances.len() {
            pairs_vec.push_back((voters.get(i as u32).unwrap(), balances[i]));
        }
        // Build token with recipients
        let issuer = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        let sac_client = token::StellarAssetClient::new(&env, &sac.address());
        for i in 0..balances.len() {
            sac_client.mint(&voters.get(i as u32).unwrap(), &balances[i]);
        }
        let token = sac.address();

        client.initialize(&admin, &token);
        (env, client, admin, token, voters)
    }

    fn make_proposal(
        env: &Env,
        client: &GovernanceClient,
        admin: &Address,
    ) -> u64 {
        let deadline = env.ledger().timestamp() + 86_400;
        client.create_proposal(admin, &deadline)
    }

    // ── initialize ────────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_ok() {
        setup(); // must not panic
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_panics() {
        let (_, client, admin, token) = setup();
        client.initialize(&admin, &token);
    }

    // ── create_proposal ───────────────────────────────────────────────────────

    #[test]
    fn test_create_proposal_returns_incrementing_ids() {
        let (env, client, admin, _) = setup();
        let deadline = env.ledger().timestamp() + 100;
        let id0 = client.create_proposal(&admin, &deadline);
        let id1 = client.create_proposal(&admin, &deadline);
        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
    }

    #[test]
    #[should_panic(expected = "deadline must be in the future")]
    fn test_create_proposal_past_deadline_panics() {
        let (env, client, admin, _) = setup();
        client.create_proposal(&admin, &env.ledger().timestamp());
    }

    #[test]
    #[should_panic(expected = "admin only")]
    fn test_create_proposal_non_admin_panics() {
        let (env, client, _, _) = setup();
        let rando = Address::generate(&env);
        client.create_proposal(&rando, &(env.ledger().timestamp() + 100));
    }

    // ── delegate ─────────────────────────────────────────────────────────────

    #[test]
    fn test_delegate_stores_mapping() {
        let (env, client, admin, _) = setup();
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        client.delegate(&a, &b);
        assert_eq!(client.get_delegate(&a), Some(b));
    }

    #[test]
    #[should_panic(expected = "cannot delegate to yourself")]
    fn test_delegate_to_self_panics() {
        let (env, client, _, _) = setup();
        let a = Address::generate(&env);
        client.delegate(&a, &a);
    }

    #[test]
    #[should_panic(expected = "circular delegation detected")]
    fn test_circular_delegation_panics() {
        let (env, client, _, _) = setup();
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        // B delegates to A first
        client.delegate(&b, &a);
        // A tries to delegate to B → circular
        client.delegate(&a, &b);
    }

    #[test]
    #[should_panic(expected = "delegate chain not allowed")]
    fn test_chain_delegation_panics() {
        let (env, client, _, _) = setup();
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        let c = Address::generate(&env);
        // B already delegates to C
        client.delegate(&b, &c);
        // A tries to delegate to B (who already has an outgoing delegation)
        client.delegate(&a, &b);
    }

    #[test]
    fn test_delegate_updates_delegated_power() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let delegator = Address::generate(&env);
        let delegate = Address::generate(&env);
        let token = make_token(&env, &[(&delegator, 500_0000000)]);
        client.initialize(&admin, &token);

        assert_eq!(client.get_delegated_power(&delegate), 0);
        client.delegate(&delegator, &delegate);
        assert_eq!(client.get_delegated_power(&delegate), 500_0000000);
    }

    // ── undelegate ────────────────────────────────────────────────────────────

    #[test]
    fn test_undelegate_removes_mapping() {
        let (env, client, _, _) = setup();
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        client.delegate(&a, &b);
        client.undelegate(&a);
        assert_eq!(client.get_delegate(&a), None);
    }

    #[test]
    #[should_panic(expected = "no active delegation")]
    fn test_undelegate_without_delegation_panics() {
        let (env, client, _, _) = setup();
        let a = Address::generate(&env);
        client.undelegate(&a);
    }

    #[test]
    fn test_undelegate_reduces_delegated_power() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let delegator = Address::generate(&env);
        let delegate = Address::generate(&env);
        let token = make_token(&env, &[(&delegator, 300_0000000)]);
        client.initialize(&admin, &token);

        client.delegate(&delegator, &delegate);
        assert_eq!(client.get_delegated_power(&delegate), 300_0000000);

        client.undelegate(&delegator);
        assert_eq!(client.get_delegated_power(&delegate), 0);
        assert_eq!(client.get_delegate(&delegator), None);
    }

    // ── vote ──────────────────────────────────────────────────────────────────

    #[test]
    fn test_vote_yes_tallied_correctly() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let voter = Address::generate(&env);
        let token = make_token(&env, &[(&voter, 1_000_0000000)]);
        client.initialize(&admin, &token);

        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 100));
        client.vote(&voter, &pid, &true);

        let p = client.get_proposal(&pid);
        assert_eq!(p.yes_votes, 1_000_0000000);
        assert_eq!(p.no_votes, 0);
    }

    #[test]
    fn test_vote_no_tallied_correctly() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let voter = Address::generate(&env);
        let token = make_token(&env, &[(&voter, 500_0000000)]);
        client.initialize(&admin, &token);

        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 100));
        client.vote(&voter, &pid, &false);

        let p = client.get_proposal(&pid);
        assert_eq!(p.no_votes, 500_0000000);
        assert_eq!(p.yes_votes, 0);
    }

    #[test]
    #[should_panic(expected = "already voted")]
    fn test_double_vote_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let voter = Address::generate(&env);
        let token = make_token(&env, &[(&voter, 100_0000000)]);
        client.initialize(&admin, &token);
        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 100));
        client.vote(&voter, &pid, &true);
        client.vote(&voter, &pid, &true); // second vote must panic
    }

    #[test]
    #[should_panic(expected = "you have delegated your vote")]
    fn test_delegator_cannot_vote_directly() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let delegator = Address::generate(&env);
        let delegate = Address::generate(&env);
        let token = make_token(&env, &[(&delegator, 200_0000000)]);
        client.initialize(&admin, &token);
        client.delegate(&delegator, &delegate);
        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 100));
        client.vote(&delegator, &pid, &true); // must panic
    }

    #[test]
    fn test_delegate_votes_with_combined_power() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let delegator = Address::generate(&env);
        let delegate = Address::generate(&env);
        // delegator has 300, delegate has 700
        let token = make_token(
            &env,
            &[(&delegator, 300_0000000), (&delegate, 700_0000000)],
        );
        client.initialize(&admin, &token);
        client.delegate(&delegator, &delegate);

        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 100));
        client.vote(&delegate, &pid, &true);

        let p = client.get_proposal(&pid);
        // delegate's power = own 700 + delegated 300 = 1000
        assert_eq!(p.yes_votes, 1_000_0000000);
    }

    #[test]
    #[should_panic(expected = "no voting power")]
    fn test_vote_with_zero_balance_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let voter = Address::generate(&env); // no tokens minted
        let token = make_token(&env, &[]);
        client.initialize(&admin, &token);
        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 100));
        client.vote(&voter, &pid, &true);
    }

    #[test]
    #[should_panic(expected = "voting period has ended")]
    fn test_vote_after_deadline_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let voter = Address::generate(&env);
        let token = make_token(&env, &[(&voter, 100_0000000)]);
        client.initialize(&admin, &token);
        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 10));
        env.ledger().with_mut(|l| l.timestamp += 20);
        client.vote(&voter, &pid, &true);
    }

    // ── finalize ──────────────────────────────────────────────────────────────

    #[test]
    fn test_finalize_passed_when_yes_wins() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let voter = Address::generate(&env);
        let token = make_token(&env, &[(&voter, 100_0000000)]);
        client.initialize(&admin, &token);
        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 10));
        client.vote(&voter, &pid, &true);
        env.ledger().with_mut(|l| l.timestamp += 20);
        client.finalize(&admin, &pid);
        assert_eq!(client.get_proposal(&pid).status, ProposalStatus::Passed);
    }

    #[test]
    fn test_finalize_rejected_when_no_wins() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let voter = Address::generate(&env);
        let token = make_token(&env, &[(&voter, 100_0000000)]);
        client.initialize(&admin, &token);
        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 10));
        client.vote(&voter, &pid, &false);
        env.ledger().with_mut(|l| l.timestamp += 20);
        client.finalize(&admin, &pid);
        assert_eq!(client.get_proposal(&pid).status, ProposalStatus::Rejected);
    }

    #[test]
    #[should_panic(expected = "voting period not ended")]
    fn test_finalize_before_deadline_panics() {
        let (env, client, admin, _) = setup();
        let pid = make_proposal(&env, &client, &admin);
        client.finalize(&admin, &pid);
    }

    // ── delegation + undelegation integration ─────────────────────────────────

    #[test]
    fn test_undelegate_then_vote_directly() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(Governance, ());
        let client = GovernanceClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let delegator = Address::generate(&env);
        let delegate = Address::generate(&env);
        let token = make_token(&env, &[(&delegator, 400_0000000)]);
        client.initialize(&admin, &token);

        client.delegate(&delegator, &delegate);
        client.undelegate(&delegator);

        let pid = client.create_proposal(&admin, &(env.ledger().timestamp() + 100));
        // After undelegating, delegator can vote directly
        client.vote(&delegator, &pid, &true);
        assert_eq!(client.get_proposal(&pid).yes_votes, 400_0000000);
    }
}
