//! events.rs — Structured event schema for the DAO Governance contract.
//!
//! Every state-changing function emits a typed event. This follows the 
//! production pattern used in the prediction market module.

use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct EventProposalCreated {
    pub proposal_id: u64,
    pub creator: Address,
    pub description: String,
    pub deadline: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct EventVoteCast {
    pub proposal_id: u64,
    pub voter: Address,
    pub support: bool,
    pub weight: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct EventProposalFinalized {
    pub proposal_id: u64,
    pub status: i32, // 0: Rejected, 1: Passed
}

#[contracttype]
#[derive(Clone)]
pub struct EventProposalExecuted {
    pub proposal_id: u64,
    pub executor: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct EventActionDispatched {
    pub proposal_id: u64,
    pub action_type: u32, // 0: Fee, 1: MaxBet, 2: MinStake, 3: Treasury
}

#[contracttype]
#[derive(Clone)]
pub struct EventDelegationUpdated {
    pub delegator: Address,
    pub delegate: Option<Address>,
}

pub fn emit_proposal_created(env: &Env, id: u64, creator: &Address, desc: &String, deadline: u32) {
    env.events().publish(
        (symbol_short!("Created"), id),
        EventProposalCreated {
            proposal_id: id,
            creator: creator.clone(),
            description: desc.clone(),
            deadline,
        },
    );
}

pub fn emit_vote_cast(env: &Env, id: u64, voter: &Address, support: bool, weight: i128) {
    env.events().publish(
        (symbol_short!("Voted"), id, voter.clone()),
        EventVoteCast {
            proposal_id: id,
            voter: voter.clone(),
            support,
            weight,
        },
    );
}

pub fn emit_proposal_finalized(env: &Env, id: u64, success: bool) {
    env.events().publish(
        (symbol_short!("Finalized"), id),
        EventProposalFinalized {
            proposal_id: id,
            status: if success { 1 } else { 0 },
        },
    );
}

pub fn emit_proposal_executed(env: &Env, id: u64, executor: &Address) {
    env.events().publish(
        (symbol_short!("Executed"), id),
        EventProposalExecuted {
            proposal_id: id,
            executor: executor.clone(),
        },
    );
}

pub fn emit_action_dispatched(env: &Env, id: u64, action_type: u32) {
    env.events().publish(
        (symbol_short!("Action"), id),
        EventActionDispatched {
            proposal_id: id,
            action_type,
        },
    );
}

pub fn emit_delegation_updated(env: &Env, delegator: &Address, delegate: Option<Address>) {
    env.events().publish(
        (symbol_short!("Delegate"), delegator.clone()),
        EventDelegationUpdated {
            delegator: delegator.clone(),
            delegate,
        },
    );
}
