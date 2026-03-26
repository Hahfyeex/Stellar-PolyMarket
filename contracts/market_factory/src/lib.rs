#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

// ── Storage TTL constants ────────────────────────────────────────────────────
const TTL_THRESHOLD: u32 = 100;
const TTL_EXTEND_TO: u32 = 1_000_000;

// ── Types ────────────────────────────────────────────────────────────────────

/// How often the off-chain cron job should call spawn_market for this template.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Schedule {
    Daily,
    Weekly,
    Monthly,
}

/// Oracle type hint for the off-chain resolver.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleType {
    PriceFeed,
    SportsApi,
    Custom,
}

/// A recurring market template stored in Persistent storage.
/// `spawn_market` creates a new market instance from this template each cycle.
#[contracttype]
#[derive(Clone)]
pub struct MarketTemplate {
    pub id: u64,
    /// Human-readable question pattern, e.g. "Will BTC close above $X this Friday?"
    pub question: String,
    /// Outcome labels, e.g. ["Yes", "No"]
    pub outcomes: Vec<String>,
    /// Market duration in seconds (added to current timestamp at spawn time)
    pub duration: u64,
    /// Oracle type hint for the off-chain resolver
    pub oracle_type: OracleType,
    /// Creation fee rate in stroops (i128, 7-decimal precision, no floats)
    pub fee_rate: i128,
    /// Spawn schedule — read by off-chain cron to decide when to call spawn_market
    pub schedule: Schedule,
    /// Address that created / owns this template
    pub owner: Address,
    /// Whether this template is active (can spawn new markets)
    pub active: bool,
}

/// A spawned market instance record.
#[contracttype]
#[derive(Clone)]
pub struct MarketInstance {
    pub template_id: u64,
    pub instance_id: u64,
    /// Ledger timestamp when this instance was spawned
    pub spawned_at: u64,
    /// Deadline timestamp (spawned_at + template.duration)
    pub deadline: u64,
}

#[contracttype]
pub enum DataKey {
    /// Admin address — Instance storage
    Admin,
    /// Template by id — Persistent storage
    Template(u64),
    /// Next template id counter — Instance storage
    NextTemplateId,
    /// Next instance id counter — Instance storage
    NextInstanceId,
    /// Instance record by instance_id — Persistent storage
    Instance(u64),
    /// List of instance ids spawned from a template — Persistent storage
    TemplateInstances(u64),
}

#[contract]
pub struct MarketFactory;

#[contractimpl]
impl MarketFactory {
    /// Initialise the factory with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "already initialized"
        );
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextTemplateId, &1u64);
        env.storage().instance().set(&DataKey::NextInstanceId, &1u64);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Register a new recurring market template. Returns the assigned template id.
    /// Auth: caller must be the admin.
    pub fn register_template(
        env: Env,
        owner: Address,
        question: String,
        outcomes: Vec<String>,
        duration: u64,
        oracle_type: OracleType,
        fee_rate: i128,
        schedule: Schedule,
    ) -> u64 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        assert!(outcomes.len() >= 2, "need at least 2 outcomes");
        assert!(duration > 0, "duration must be positive");
        assert!(fee_rate >= 0, "fee_rate must be non-negative");

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextTemplateId)
            .unwrap();

        let template = MarketTemplate {
            id,
            question,
            outcomes,
            duration,
            oracle_type,
            fee_rate,
            schedule,
            owner,
            active: true,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Template(id), &template);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Template(id), TTL_THRESHOLD, TTL_EXTEND_TO);

        // Initialise empty instance list for this template
        env.storage()
            .persistent()
            .set(&DataKey::TemplateInstances(id), &Vec::<u64>::new(&env));
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::TemplateInstances(id), TTL_THRESHOLD, TTL_EXTEND_TO);

        env.storage()
            .instance()
            .set(&DataKey::NextTemplateId, &(id + 1));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events()
            .publish((symbol_short!("TplReg"), id), template.owner);

        id
    }

    /// Spawn a new market instance from a template.
    /// Called by the off-chain cron job on each schedule tick.
    /// Auth: caller must be the admin.
    /// Returns the new instance id.
    pub fn spawn_market(env: Env, template_id: u64) -> u64 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let template: MarketTemplate = env
            .storage()
            .persistent()
            .get(&DataKey::Template(template_id))
            .expect("template not found");

        assert!(template.active, "template is inactive");

        let instance_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextInstanceId)
            .unwrap();

        let now = env.ledger().timestamp();
        let instance = MarketInstance {
            template_id,
            instance_id,
            spawned_at: now,
            deadline: now + template.duration,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Instance(instance_id), &instance);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Instance(instance_id), TTL_THRESHOLD, TTL_EXTEND_TO);

        // Append to template's instance list
        let mut instances: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::TemplateInstances(template_id))
            .unwrap_or(Vec::new(&env));
        instances.push_back(instance_id);
        env.storage()
            .persistent()
            .set(&DataKey::TemplateInstances(template_id), &instances);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::TemplateInstances(template_id), TTL_THRESHOLD, TTL_EXTEND_TO);

        env.storage()
            .instance()
            .set(&DataKey::NextInstanceId, &(instance_id + 1));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events()
            .publish((symbol_short!("Spawned"), template_id), instance_id);

        instance_id
    }

    /// Deactivate a template so no new markets can be spawned from it.
    /// Auth: admin only.
    pub fn deactivate_template(env: Env, template_id: u64) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut template: MarketTemplate = env
            .storage()
            .persistent()
            .get(&DataKey::Template(template_id))
            .expect("template not found");

        template.active = false;
        env.storage()
            .persistent()
            .set(&DataKey::Template(template_id), &template);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Template(template_id), TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// Reactivate a previously deactivated template.
    /// Auth: admin only.
    pub fn reactivate_template(env: Env, template_id: u64) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut template: MarketTemplate = env
            .storage()
            .persistent()
            .get(&DataKey::Template(template_id))
            .expect("template not found");

        template.active = true;
        env.storage()
            .persistent()
            .set(&DataKey::Template(template_id), &template);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Template(template_id), TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    // ── Getters ──────────────────────────────────────────────────────────────

    pub fn get_template(env: Env, template_id: u64) -> MarketTemplate {
        env.storage()
            .persistent()
            .get(&DataKey::Template(template_id))
            .expect("template not found")
    }

    pub fn get_instance(env: Env, instance_id: u64) -> MarketInstance {
        env.storage()
            .persistent()
            .get(&DataKey::Instance(instance_id))
            .expect("instance not found")
    }

    pub fn get_template_instances(env: Env, template_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::TemplateInstances(template_id))
            .unwrap_or(Vec::new(&env))
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env, String};

    fn setup() -> (Env, MarketFactoryClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, MarketFactory);
        let client = MarketFactoryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, client, admin)
    }

    fn default_template(env: &Env, client: &MarketFactoryClient, owner: &Address) -> u64 {
        client.register_template(
            owner,
            &String::from_str(env, "Will BTC close above $100k this Friday?"),
            &vec![env, String::from_str(env, "Yes"), String::from_str(env, "No")],
            &604_800u64, // 1 week in seconds
            &OracleType::PriceFeed,
            &1_000_000i128, // 0.1 XLM fee
            &Schedule::Weekly,
        )
    }

    #[test]
    fn test_initialize() {
        let (_, client, _) = setup();
        // If initialize didn't panic, it succeeded — verify by registering a template
        let (env, client, admin) = setup();
        let id = default_template(&env, &client, &admin);
        assert_eq!(id, 1u64);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_panics() {
        let (_, client, admin) = setup();
        client.initialize(&admin);
    }

    #[test]
    fn test_register_template_returns_sequential_ids() {
        let (env, client, admin) = setup();
        let id1 = default_template(&env, &client, &admin);
        let id2 = default_template(&env, &client, &admin);
        assert_eq!(id1, 1u64);
        assert_eq!(id2, 2u64);
    }

    #[test]
    fn test_get_template_roundtrip() {
        let (env, client, admin) = setup();
        let id = default_template(&env, &client, &admin);
        let t = client.get_template(&id);
        assert_eq!(t.id, id);
        assert_eq!(t.schedule, Schedule::Weekly);
        assert_eq!(t.oracle_type, OracleType::PriceFeed);
        assert_eq!(t.fee_rate, 1_000_000i128);
        assert_eq!(t.duration, 604_800u64);
        assert!(t.active);
    }

    #[test]
    fn test_spawn_market_creates_instance() {
        let (env, client, admin) = setup();
        let tid = default_template(&env, &client, &admin);
        let iid = client.spawn_market(&tid);
        assert_eq!(iid, 1u64);
        let inst = client.get_instance(&iid);
        assert_eq!(inst.template_id, tid);
        assert_eq!(inst.deadline, inst.spawned_at + 604_800u64);
    }

    #[test]
    fn test_spawn_multiple_instances_sequential_ids() {
        let (env, client, admin) = setup();
        let tid = default_template(&env, &client, &admin);
        let i1 = client.spawn_market(&tid);
        let i2 = client.spawn_market(&tid);
        assert_eq!(i1, 1u64);
        assert_eq!(i2, 2u64);
    }

    #[test]
    fn test_get_template_instances_tracks_all_spawns() {
        let (env, client, admin) = setup();
        let tid = default_template(&env, &client, &admin);
        client.spawn_market(&tid);
        client.spawn_market(&tid);
        client.spawn_market(&tid);
        let instances = client.get_template_instances(&tid);
        assert_eq!(instances.len(), 3u32);
    }

    #[test]
    #[should_panic(expected = "template is inactive")]
    fn test_spawn_inactive_template_panics() {
        let (env, client, admin) = setup();
        let tid = default_template(&env, &client, &admin);
        client.deactivate_template(&tid);
        client.spawn_market(&tid);
    }

    #[test]
    fn test_deactivate_and_reactivate_template() {
        let (env, client, admin) = setup();
        let tid = default_template(&env, &client, &admin);
        client.deactivate_template(&tid);
        assert!(!client.get_template(&tid).active);
        client.reactivate_template(&tid);
        assert!(client.get_template(&tid).active);
        // Should be spawnable again
        let iid = client.spawn_market(&tid);
        assert_eq!(iid, 1u64);
    }

    #[test]
    #[should_panic(expected = "need at least 2 outcomes")]
    fn test_register_template_single_outcome_panics() {
        let (env, client, admin) = setup();
        client.register_template(
            &admin,
            &String::from_str(&env, "Q"),
            &vec![&env, String::from_str(&env, "Yes")],
            &86400u64,
            &OracleType::Custom,
            &0i128,
            &Schedule::Daily,
        );
    }

    #[test]
    #[should_panic(expected = "duration must be positive")]
    fn test_register_template_zero_duration_panics() {
        let (env, client, admin) = setup();
        client.register_template(
            &admin,
            &String::from_str(&env, "Q"),
            &vec![&env, String::from_str(&env, "Yes"), String::from_str(&env, "No")],
            &0u64,
            &OracleType::Custom,
            &0i128,
            &Schedule::Daily,
        );
    }

    #[test]
    fn test_instances_from_different_templates_have_unique_ids() {
        let (env, client, admin) = setup();
        let t1 = default_template(&env, &client, &admin);
        let t2 = default_template(&env, &client, &admin);
        let i1 = client.spawn_market(&t1);
        let i2 = client.spawn_market(&t2);
        assert_ne!(i1, i2);
        assert_eq!(client.get_instance(&i1).template_id, t1);
        assert_eq!(client.get_instance(&i2).template_id, t2);
    }
}
