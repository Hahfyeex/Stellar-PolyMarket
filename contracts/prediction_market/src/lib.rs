#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, BytesN, Env, Map, String, Vec,
};

#[contracttype]
pub enum DataKey {
    Initialized,
    Admin,
    Market(u64),
    Bets(u64),
    TotalPool(u64),
    AuditLog(u64),
    AuditLogCount,
}

#[contracttype]
#[derive(Clone)]
pub struct Market {
    pub id: u64,
    pub question: String,
    pub options: Vec<String>, // renamed from outcomes for clarity per issue spec
    pub deadline: u64,        // renamed from end_date per issue spec
    pub resolved: bool,
    pub winning_outcome: u32,
    pub token: Address,
}

#[contract]
pub struct PredictionMarket;

/// Guard: panics if the contract has already been initialized.
fn check_initialized(env: &Env) {
    let is_init: bool = env
        .storage()
        .instance()
        .get(&DataKey::Initialized)
        .unwrap_or(false);
    assert!(!is_init, "Contract already initialized");
}

#[contractimpl]
impl PredictionMarket {
    /// Initialize contract with admin address.
    /// Uses check_initialized guard to prevent double-initialization.
    pub fn initialize(env: Env, admin: Address) {
        check_initialized(&env);
        admin.require_auth();
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Create a new prediction market.
    /// Market metadata (question, options, deadline) stored in persistent storage.
    pub fn create_market(
        env: Env,
        id: u64,
        question: String,
        options: Vec<String>,
        deadline: u64,
        token: Address,
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        assert!(
            !env.storage().persistent().has(&DataKey::Market(id)),
            "Market already exists"
        );
        assert!(options.len() >= 2, "Need at least 2 options");
        assert!(
            deadline > env.ledger().timestamp(),
            "Deadline must be in the future"
        );

        let market = Market {
            id,
            question,
            options,
            deadline,
            resolved: false,
            winning_outcome: 0,
            token,
        };

        // Persist market metadata in persistent storage (survives ledger archival)
        env.storage()
            .persistent()
            .set(&DataKey::Market(id), &market);
        env.storage()
            .persistent()
            .set(&DataKey::TotalPool(id), &0i128);
        env.storage()
            .persistent()
            .set(&DataKey::Bets(id), &Map::<Address, (u32, i128)>::new(&env));
    }

    /// Place a bet on an option — transfers tokens into the contract.
    pub fn place_bet(env: Env, market_id: u64, option_index: u32, bettor: Address, amount: i128) {
        bettor.require_auth();
        assert!(amount > 0, "Amount must be positive");

        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(!market.resolved, "Market already resolved");
        assert!(
            env.ledger().timestamp() < market.deadline,
            "Market deadline has passed"
        );
        assert!(option_index < market.options.len(), "Invalid option index");

        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&bettor, &env.current_contract_address(), &amount);

        let mut bets: Map<Address, (u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap();
        bets.set(bettor, (option_index, amount));
        env.storage()
            .persistent()
            .set(&DataKey::Bets(market_id), &bets);

        let pool: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalPool(market_id))
            .unwrap();
        env.storage()
            .persistent()
            .set(&DataKey::TotalPool(market_id), &(pool + amount));
    }

    /// Resolve market — only admin (oracle-triggered).
    pub fn resolve_market(env: Env, market_id: u64, winning_outcome: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(!market.resolved, "Already resolved");
        assert!(
            winning_outcome < market.options.len(),
            "Invalid outcome index"
        );

        market.resolved = true;
        market.winning_outcome = winning_outcome;
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_id), &market);
    }

    /// Distribute rewards proportionally to winners (3% platform fee).
    pub fn distribute_rewards(env: Env, market_id: u64) {
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.resolved, "Market not resolved yet");

        let bets: Map<Address, (u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap();

        let total_pool: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalPool(market_id))
            .unwrap();

        let mut winning_stake: i128 = 0;
        for (_, (outcome, amount)) in bets.iter() {
            if outcome == market.winning_outcome {
                winning_stake += amount;
            }
        }

        if winning_stake == 0 {
            return;
        }

        let payout_pool = total_pool * 97 / 100;
        let token_client = token::Client::new(&env, &market.token);

        for (bettor, (outcome, amount)) in bets.iter() {
            if outcome == market.winning_outcome {
                let payout = (amount * payout_pool) / winning_stake;
                token_client.transfer(&env.current_contract_address(), &bettor, &payout);
            }
        }
    }

    /// Read a market's stored metadata.
    pub fn get_market(env: Env, market_id: u64) -> Market {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .unwrap()
    }

    /// Get total pool for a market.
    pub fn get_pool(env: Env, market_id: u64) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalPool(market_id))
            .unwrap_or(0)
    }

    /// Store an audit log hash on-chain. Only callable by admin.
    /// `cid_hash` is the SHA-256 hash of the IPFS CID for the audit entry.
    pub fn store_audit_hash(env: Env, admin: Address, cid_hash: BytesN<32>) {
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert!(admin == stored_admin, "Only admin can store audit hashes");
        admin.require_auth();

        // Increment the audit log counter
        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::AuditLogCount)
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&DataKey::AuditLog(count), &cid_hash);
        env.storage()
            .persistent()
            .set(&DataKey::AuditLogCount, &(count + 1));
    }

    /// Retrieve an audit log hash by its sequential ID.
    pub fn get_audit_hash(env: Env, log_id: u64) -> BytesN<32> {
        env.storage()
            .persistent()
            .get(&DataKey::AuditLog(log_id))
            .unwrap()
    }

    /// Get the total number of audit log entries stored on-chain.
    pub fn get_audit_log_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::AuditLogCount)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, BytesN, Env, String};

    #[test]
    fn test_initialize_and_create_market() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let token = Address::generate(&env);

        // Initialize
        client.initialize(&admin);

        // Create market with question, options, deadline
        let question = String::from_str(&env, "Will BTC exceed $100k by end of 2025?");
        let options = vec![
            &env,
            String::from_str(&env, "Yes"),
            String::from_str(&env, "No"),
        ];
        let deadline = env.ledger().timestamp() + 86400; // 1 day from now

        client.create_market(&1u64, &question, &options, &deadline, &token);

        // Read back and verify stored metadata
        let market = client.get_market(&1u64);
        assert_eq!(market.id, 1u64);
        assert_eq!(
            market.question,
            String::from_str(&env, "Will BTC exceed $100k by end of 2025?")
        );
        assert_eq!(market.options.len(), 2);
        assert_eq!(market.deadline, deadline);
        assert!(!market.resolved);

        // Visual validation — log stored market data
        soroban_sdk::log!(
            &env,
            "✅ Market stored: id={}, deadline={}, resolved={}",
            market.id,
            market.deadline,
            market.resolved
        );
    }

    #[test]
    fn test_store_and_get_audit_hash() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Initially zero audit logs
        assert_eq!(client.get_audit_log_count(), 0);

        // Store a mock CID hash (32 bytes)
        let hash = BytesN::from_array(&env, &[1u8; 32]);
        client.store_audit_hash(&admin, &hash);

        assert_eq!(client.get_audit_log_count(), 1);
        assert_eq!(client.get_audit_hash(&0u64), hash);

        // Store a second hash
        let hash2 = BytesN::from_array(&env, &[2u8; 32]);
        client.store_audit_hash(&admin, &hash2);

        assert_eq!(client.get_audit_log_count(), 2);
        assert_eq!(client.get_audit_hash(&1u64), hash2);
    }

    #[test]
    #[should_panic(expected = "Contract already initialized")]
    fn test_double_initialize_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, PredictionMarket);
        let client = PredictionMarketClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin); // should panic
    }
}
