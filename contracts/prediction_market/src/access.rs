/// access.rs — Role-based access control for the prediction market contract.
///
/// # Role Hierarchy
///
/// ```
/// SuperAdmin
///   ├── assign_role / revoke_role (only SuperAdmin)
///   ├── set_global_status
///   └── invest_vault
///
/// Resolver   → propose_resolution, resolve_market, sweep_unclaimed, batch_payout
/// FeeSetter  → update_fee, update_bet_limits, configure_fee_split,
///              update_fee_split, update_fee_addresses, set_token_whitelist
/// Pauser     → set_paused, create_market
/// ```
///
/// # Storage
/// Role-to-address mappings are stored in **Persistent** storage so they survive
/// instance eviction. Every write extends TTL (100 ledger min, 1_000_000 max).
///
/// # Auth
/// `require_role(env, caller, role)` calls `caller.require_auth()` first, then
/// verifies the caller is the address assigned to that role. This means the
/// caller must both sign the transaction AND hold the role.

use soroban_sdk::{contracttype, contracterror, Address, Env};

// ── Storage keys ──────────────────────────────────────────────────────────────

/// Persistent storage keys for role assignments, platform status, and token whitelist.
#[contracttype]
#[derive(Clone, PartialEq, Eq)]
pub enum AccessKey {
    /// Maps Role → Address. Stored in Persistent storage.
    RoleMap(Role),
    PlatformStatus,
    WhitelistedToken(Address),
}

// ── Role enum ─────────────────────────────────────────────────────────────────

/// Four-role separation of privilege.
///
/// | Role       | Responsibilities                                              |
/// |------------|---------------------------------------------------------------|
/// | SuperAdmin | Assign/revoke roles, global status, vault investment          |
/// | Resolver   | Propose/finalise resolution, sweep unclaimed, batch payout    |
/// | FeeSetter  | Fee config, bet limits, fee split, token whitelist            |
/// | Pauser     | Pause/unpause markets, create markets                         |
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role {
    SuperAdmin,
    Resolver,
    FeeSetter,
    Pauser,
}

/// Legacy alias kept so existing `AccessRole::Admin` references in tests compile.
/// Maps to `Role::SuperAdmin` semantically.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AccessRole {
    Admin,
    Oracle,
    Resolver,
}

// ── Platform status ───────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AccessPlatformStatus {
    Active,
    Paused,
    Shutdown,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ContractError {
    AccessDenied    = 1,
    RoleNotSet      = 2,
    PlatformPaused  = 3,
    PlatformShutdown = 4,
}

// ── TTL constants ─────────────────────────────────────────────────────────────

const TTL_MIN: u32     = 100;
const TTL_MAX: u32     = 1_000_000;

// ── Role assignment (SuperAdmin only) ─────────────────────────────────────────

/// Assign `address` to `role`. Only the current SuperAdmin may call this.
/// On first initialisation call `bootstrap_super_admin` instead.
///
/// Stores in Persistent storage with TTL extension.
pub fn assign_role(env: &Env, caller: &Address, role: Role, address: &Address) {
    // SuperAdmin must authorise every role change
    require_role(env, caller, Role::SuperAdmin);
    _write_role(env, role, address);
}

/// Revoke a role by removing its mapping. Only SuperAdmin may call this.
/// SuperAdmin cannot revoke their own role (prevents lockout).
pub fn revoke_role(env: &Env, caller: &Address, role: Role) {
    require_role(env, caller, Role::SuperAdmin);
    assert!(role != Role::SuperAdmin, "SuperAdmin cannot revoke their own role");
    env.storage().persistent().remove(&AccessKey::RoleMap(role));
}

/// Bootstrap: set the initial SuperAdmin during `initialize`.
/// Must only be called once (guarded by the `Initialized` flag in lib.rs).
pub fn bootstrap_super_admin(env: &Env, address: &Address) {
    _write_role(env, Role::SuperAdmin, address);
}

/// Internal write helper — sets role mapping and extends TTL.
fn _write_role(env: &Env, role: Role, address: &Address) {
    env.storage()
        .persistent()
        .set(&AccessKey::RoleMap(role), address);
    env.storage()
        .persistent()
        .extend_ttl(&AccessKey::RoleMap(role), TTL_MIN, TTL_MAX);
}

// ── Role enforcement ──────────────────────────────────────────────────────────

/// Require that `caller` holds `role` AND has authorised this invocation.
///
/// 1. Calls `caller.require_auth()` — transaction must be signed by caller.
/// 2. Looks up the address assigned to `role` in Persistent storage.
/// 3. Panics with `AccessDenied` if the role is unset or caller ≠ role address.
pub fn require_role(env: &Env, caller: &Address, role: Role) {
    caller.require_auth();
    let assigned: Address = env
        .storage()
        .persistent()
        .get(&AccessKey::RoleMap(role))
        .unwrap_or_else(|| panic!("AccessDenied: role {:?} not assigned", role));
    assert!(
        *caller == assigned,
        "AccessDenied: caller does not hold role {:?}",
        role
    );
}

/// Read the address currently assigned to a role (returns None if unset).
pub fn get_role_address(env: &Env, role: Role) -> Option<Address> {
    env.storage().persistent().get(&AccessKey::RoleMap(role))
}

// ── Legacy shim — keeps old call sites compiling during migration ─────────────
//
// `check_role(&env, AccessRole::Admin)` → `require_role` with SuperAdmin.
// Remove once all call sites are updated to the new API.

/// Legacy: require the address stored under the old `AccessKey::Role(role)` key.
/// Kept for backward compatibility with existing Instance-storage role entries
/// written before this migration. New code must use `require_role`.
pub fn check_role(env: &Env, _role: AccessRole) {
    // During migration the old Instance key may still exist; fall back to
    // Persistent SuperAdmin mapping if not.
    let assigned: Address = env
        .storage()
        .instance()
        .get(&crate::access::_LegacyAccessKey::Role(_role))
        .or_else(|| env.storage().persistent().get(&AccessKey::RoleMap(Role::SuperAdmin)))
        .unwrap_or_else(|| panic!("AccessDenied"));
    assigned.require_auth();
}

/// Legacy: write a role to Instance storage (used only by `initialize` shim).
pub fn set_role(env: &Env, role: AccessRole, address: &Address) {
    env.storage()
        .instance()
        .set(&_LegacyAccessKey::Role(role), address);
}

/// Legacy Instance-storage key — kept only for the migration shim above.
#[contracttype]
#[derive(Clone, PartialEq, Eq)]
pub enum _LegacyAccessKey {
    Role(AccessRole),
}

// ── Platform status ───────────────────────────────────────────────────────────

pub fn set_platform_status(env: &Env, status: AccessPlatformStatus) {
    env.storage()
        .instance()
        .set(&AccessKey::PlatformStatus, &status);
}

pub fn check_platform_active(env: &Env) {
    let status: AccessPlatformStatus = env
        .storage()
        .instance()
        .get(&AccessKey::PlatformStatus)
        .unwrap_or(AccessPlatformStatus::Active);
    match status {
        AccessPlatformStatus::Active => {}
        AccessPlatformStatus::Paused   => panic!("Platform is paused"),
        AccessPlatformStatus::Shutdown => panic!("Platform is shut down"),
    }
}

// ── Token whitelist ───────────────────────────────────────────────────────────

pub fn set_whitelisted_token(env: &Env, token: &Address, status: bool) {
    if status {
        env.storage()
            .persistent()
            .set(&AccessKey::WhitelistedToken(token.clone()), &true);
        env.storage()
            .persistent()
            .extend_ttl(&AccessKey::WhitelistedToken(token.clone()), TTL_MIN, TTL_MAX);
    } else {
        env.storage()
            .persistent()
            .remove(&AccessKey::WhitelistedToken(token.clone()));
    }
}

pub fn is_whitelisted_token(env: &Env, token: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&AccessKey::WhitelistedToken(token.clone()))
}

pub fn check_whitelisted_token(env: &Env, token: &Address) {
    assert!(is_whitelisted_token(env, token), "Token not whitelisted");
}
