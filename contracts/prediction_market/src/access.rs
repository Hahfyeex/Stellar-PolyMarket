use soroban_sdk::{contracttype, contracterror, Address, Env};

/// Persistent storage keys for role assignments.
#[contracttype]
#[derive(Clone)]
pub enum Role {
    Admin,
    Oracle,
    Resolver,
}

/// Contract-level errors surfaced via Soroban's error system.
#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ContractError {
    AccessDenied = 1,
    RoleNotSet = 2,
}

/// Fetch the address assigned to a role from persistent storage.
pub fn get_role(env: &Env, role: Role) -> Option<Address> {
    env.storage().persistent().get(&role)
}

/// Set the address for a role in persistent storage.
pub fn set_role(env: &Env, role: Role, address: &Address) {
    env.storage().persistent().set(&role, address);
}

/// Require that the address assigned to `role` has authorized this invocation.
/// Panics with `ContractError::AccessDenied` if the role is unset or auth fails.
pub fn check_role(env: &Env, role: Role) {
    let address: Address = env
        .storage()
        .persistent()
        .get(&role)
        .unwrap_or_else(|| panic!("{}", ContractError::AccessDenied as u32));
    address.require_auth();
}
