use soroban_sdk::{contracttype, contracterror, Address, Env};

/// Persistent storage keys for role assignments and platform status.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AccessKey {
    Role(AccessRole),
    PlatformStatus,
}

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AccessRole {
    Admin,
    Oracle,
    Resolver,
}

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AccessPlatformStatus {
    Active,
    Paused,
    Shutdown,
}

/// Contract-level errors surfaced via Soroban's error system.
#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ContractError {
    AccessDenied = 1,
    RoleNotSet = 2,
    PlatformPaused = 3,
    PlatformShutdown = 4,
}

/// Set the address for a role in instance storage.
pub fn set_role(env: &Env, role: AccessRole, address: &Address) {
    env.storage().instance().set(&AccessKey::Role(role), address);
}

/// Require that the address assigned to `role` has authorized this invocation.
pub fn check_role(env: &Env, role: AccessRole) {
    let address: Address = env
        .storage()
        .instance()
        .get(&AccessKey::Role(role))
        .unwrap_or_else(|| panic!("{}", ContractError::AccessDenied as u32));
    address.require_auth();
}

/// Helper to set the platform status (Active, Paused, or Shutdown).
pub fn set_platform_status(env: &Env, status: AccessPlatformStatus) {
    env.storage().instance().set(&AccessKey::PlatformStatus, &status);
}

/// Helper to check if the platform is active.
pub fn check_platform_active(env: &Env) {
    let status: AccessPlatformStatus = env
        .storage()
        .instance()
        .get(&AccessKey::PlatformStatus)
        .unwrap_or(AccessPlatformStatus::Active);

    match status {
        AccessPlatformStatus::Active => {}
        AccessPlatformStatus::Paused => panic!("Platform is paused"),
        AccessPlatformStatus::Shutdown => panic!("Platform is shut down"),
    }
}
