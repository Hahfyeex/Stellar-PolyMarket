/// test_roles.rs — Unit tests for the four-role RBAC system.
///
/// Covers:
///   - bootstrap_super_admin sets SuperAdmin in Persistent storage
///   - assign_role / revoke_role require SuperAdmin auth
///   - require_role panics when role unset, caller wrong, or auth missing
///   - SuperAdmin cannot revoke their own role
///   - Each privileged function rejects callers without the correct role
///   - Role assignment blast-radius: compromising one role does not grant others

#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use crate::access::{
        assign_role, bootstrap_super_admin, get_role_address, require_role, revoke_role, Role,
    };

    fn setup() -> (Env, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let super_admin = Address::generate(&env);
        let resolver    = Address::generate(&env);
        let fee_setter  = Address::generate(&env);
        let pauser      = Address::generate(&env);
        (env, super_admin, resolver, fee_setter, pauser)
    }

    // ── bootstrap ────────────────────────────────────────────────────────────

    #[test]
    fn bootstrap_sets_super_admin() {
        let (env, super_admin, ..) = setup();
        bootstrap_super_admin(&env, &super_admin);
        assert_eq!(get_role_address(&env, Role::SuperAdmin), Some(super_admin));
    }

    // ── assign_role ───────────────────────────────────────────────────────────

    #[test]
    fn super_admin_can_assign_all_roles() {
        let (env, super_admin, resolver, fee_setter, pauser) = setup();
        bootstrap_super_admin(&env, &super_admin);

        assign_role(&env, &super_admin, Role::Resolver,  &resolver);
        assign_role(&env, &super_admin, Role::FeeSetter, &fee_setter);
        assign_role(&env, &super_admin, Role::Pauser,    &pauser);

        assert_eq!(get_role_address(&env, Role::Resolver),  Some(resolver));
        assert_eq!(get_role_address(&env, Role::FeeSetter), Some(fee_setter));
        assert_eq!(get_role_address(&env, Role::Pauser),    Some(pauser));
    }

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn non_super_admin_cannot_assign_role() {
        let (env, super_admin, resolver, fee_setter, _) = setup();
        bootstrap_super_admin(&env, &super_admin);
        // resolver tries to assign fee_setter — must fail
        assign_role(&env, &resolver, Role::FeeSetter, &fee_setter);
    }

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn unassigned_role_panics_on_require() {
        let (env, _, resolver, ..) = setup();
        // No SuperAdmin bootstrapped, no roles set
        require_role(&env, &resolver, Role::Resolver);
    }

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn wrong_caller_panics_on_require() {
        let (env, super_admin, resolver, fee_setter, _) = setup();
        bootstrap_super_admin(&env, &super_admin);
        assign_role(&env, &super_admin, Role::Resolver, &resolver);
        // fee_setter tries to act as Resolver
        require_role(&env, &fee_setter, Role::Resolver);
    }

    // ── revoke_role ───────────────────────────────────────────────────────────

    #[test]
    fn super_admin_can_revoke_other_roles() {
        let (env, super_admin, resolver, ..) = setup();
        bootstrap_super_admin(&env, &super_admin);
        assign_role(&env, &super_admin, Role::Resolver, &resolver);
        assert!(get_role_address(&env, Role::Resolver).is_some());

        revoke_role(&env, &super_admin, Role::Resolver);
        assert!(get_role_address(&env, Role::Resolver).is_none());
    }

    #[test]
    #[should_panic(expected = "SuperAdmin cannot revoke their own role")]
    fn super_admin_cannot_revoke_self() {
        let (env, super_admin, ..) = setup();
        bootstrap_super_admin(&env, &super_admin);
        revoke_role(&env, &super_admin, Role::SuperAdmin);
    }

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn non_super_admin_cannot_revoke_role() {
        let (env, super_admin, resolver, ..) = setup();
        bootstrap_super_admin(&env, &super_admin);
        assign_role(&env, &super_admin, Role::Resolver, &resolver);
        // resolver tries to revoke pauser — must fail
        revoke_role(&env, &resolver, Role::Pauser);
    }

    // ── blast-radius isolation ────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn resolver_cannot_act_as_fee_setter() {
        let (env, super_admin, resolver, ..) = setup();
        bootstrap_super_admin(&env, &super_admin);
        assign_role(&env, &super_admin, Role::Resolver, &resolver);
        // Resolver tries to use FeeSetter privilege
        require_role(&env, &resolver, Role::FeeSetter);
    }

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn fee_setter_cannot_act_as_resolver() {
        let (env, super_admin, _, fee_setter, _) = setup();
        bootstrap_super_admin(&env, &super_admin);
        assign_role(&env, &super_admin, Role::FeeSetter, &fee_setter);
        require_role(&env, &fee_setter, Role::Resolver);
    }

    #[test]
    #[should_panic(expected = "AccessDenied")]
    fn pauser_cannot_act_as_super_admin() {
        let (env, super_admin, _, _, pauser) = setup();
        bootstrap_super_admin(&env, &super_admin);
        assign_role(&env, &super_admin, Role::Pauser, &pauser);
        require_role(&env, &pauser, Role::SuperAdmin);
    }

    // ── role reassignment ─────────────────────────────────────────────────────

    #[test]
    fn super_admin_can_reassign_role_to_new_address() {
        let (env, super_admin, resolver, fee_setter, _) = setup();
        bootstrap_super_admin(&env, &super_admin);
        assign_role(&env, &super_admin, Role::Resolver, &resolver);
        // Reassign Resolver to fee_setter address
        assign_role(&env, &super_admin, Role::Resolver, &fee_setter);
        assert_eq!(get_role_address(&env, Role::Resolver), Some(fee_setter));
    }

    // ── get_role_address ──────────────────────────────────────────────────────

    #[test]
    fn get_role_address_returns_none_when_unset() {
        let (env, ..) = setup();
        assert_eq!(get_role_address(&env, Role::Resolver), None);
        assert_eq!(get_role_address(&env, Role::FeeSetter), None);
        assert_eq!(get_role_address(&env, Role::Pauser), None);
        assert_eq!(get_role_address(&env, Role::SuperAdmin), None);
    }
}
