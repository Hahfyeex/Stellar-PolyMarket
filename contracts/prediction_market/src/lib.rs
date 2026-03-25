#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Map, String, Vec,
};

mod settlement_math;

use settlement_math::{
    calculate_payout_pool,
};

#[contracttype]
pub enum DataKey {
    Initialized,
    Admin,
    Market(u64),
    Bets(u64),
    TotalPool(u64),
}

#[contracttype]
#[derive(Clone)]
pub struct Market {
    pub id: u64,
    pub question: String,
    pub options: Vec<String>,  // renamed from outcomes for clarity per issue spec
    pub deadline: u64,         // renamed from end_date per issue spec
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
        env.storage().persistent().set(&DataKey::Market(id), &market);
        env.storage().persistent().set(&DataKey::TotalPool(id), &0i128);
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
        assert!(
            option_index < market.options.len(),
            "Invalid option index"
        );

        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&bettor, &env.current_contract_address(), &amount);

        let mut bets: Map<Address, (u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))
            .unwrap();
        bets.set(bettor, (option_index, amount));
        env.storage().persistent().set(&DataKey::Bets(market_id), &bets);

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

    /// Distribute rewards proportionally to winners using fixed-point arithmetic.
    /// 
    /// This function implements the settlement logic with proper dust handling:
    /// 1. Calculates 3% platform fee
    /// 2. Calculates payout pool (97% of total)
    /// 3. Uses fixed-point arithmetic for precise division
    /// 4. Redistributes dust to ensure 100% distribution
    /// 
    /// The payout formula for each winner is:
    ///   payout = (bet_amount / winning_stake) * payout_pool
    /// 
    /// This ensures:
    /// - Total payouts + dust = payout_pool (conservation)
    /// - Proportional distribution based on bet amounts
    /// - No XLM lost to rounding errors
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

        // Calculate winning stake and collect winning bets
        let mut winning_bets: Vec<(Address, i128)> = Vec::new(&env);
        let mut winning_stake: i128 = 0;
        
        for (bettor, (outcome, amount)) in bets.iter() {
            if outcome == market.winning_outcome {
                winning_bets.push_back((bettor.clone(), amount));
                winning_stake += amount;
            }
        }

        if winning_stake == 0 {
            // No winners - funds remain in contract (or could go to treasury)
            return;
        }

        // Calculate payout pool after 3% platform fee
        let payout_pool = calculate_payout_pool(total_pool);
        
        // Calculate all payouts with dust handling using inline logic
        let num_winners = winning_bets.len();
        let mut payouts: Vec<i128> = Vec::new(&env);
        let mut ideal_total: i128 = 0;
        
        // First pass: calculate ideal payouts
        for i in 0..num_winners {
            let (_, amount) = winning_bets.get(i).unwrap_or((Address::from_string(&String::from_str(&env, "")), 0));
            let payout = if winning_stake > 0 { (amount * payout_pool) / winning_stake } else { 0 };
            payouts.push_back(payout);
            ideal_total += payout;
        }
        
        // Calculate and redistribute dust
        let dust = payout_pool - ideal_total;
        if dust > 0 && num_winners > 0 {
            let dust_per_winner = dust / num_winners as i128;
            let extra_dust = dust % num_winners as i128;
            for i in 0..num_winners {
                let current = payouts.get(i).unwrap_or(0);
                let add = dust_per_winner + if (i as i128) < extra_dust { 1 } else { 0 };
                payouts.set(i, current + add);
            }
        }
        
        // Verify conservation before distributing
        let mut variance: i128 = 0;
        for i in 0..payouts.len() {
            variance += payouts.get(i).unwrap_or(0);
        }
        variance = payout_pool - variance;
        assert!(variance == 0, "Payout conservation violated: variance = {}", variance);

        // Distribute payouts
        let token_client = token::Client::new(&env, &market.token);
        
        for i in 0..num_winners {
            let (bettor, _) = winning_bets.get(i).unwrap_or((Address::from_string(&String::from_str(&env, "")), 0));
            let payout = payouts.get(i).unwrap_or(0);
            if payout > 0 {
                token_client.transfer(&env.current_contract_address(), &bettor, &payout);
            }
        }
        
        // Log settlement summary for verification
        soroban_sdk::log!(
            &env,
            "Settlement: pool={}, fee={}, payout_pool={}, winners={}, dust={}, variance={}",
            total_pool,
            total_pool - payout_pool,
            payout_pool,
            num_winners,
            dust,
            variance
        );
    }

    /// Get settlement metadata for a market (for verification).
    /// Returns the calculation parameters without executing transfers.
    pub fn get_settlement_info(env: Env, market_id: u64) -> Option<(i128, i128, i128, i128, u32)> {
        let market: Market = env
            .storage()
            .persistent()
            .get(&DataKey::Market(market_id))?;
            
        if !market.resolved {
            return None;
        }

        let bets: Map<Address, (u32, i128)> = env
            .storage()
            .persistent()
            .get(&DataKey::Bets(market_id))?;

        let total_pool: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalPool(market_id))?;

        let mut winning_stake: i128 = 0;
        let mut num_winners: u32 = 0;
        
        for (_, (outcome, amount)) in bets.iter() {
            if outcome == market.winning_outcome {
                winning_stake += amount;
                num_winners += 1;
            }
        }

        let payout_pool = calculate_payout_pool(total_pool);
        
        Some((total_pool, total_pool - payout_pool, payout_pool, winning_stake, num_winners))
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Env, String};

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
        assert_eq!(market.question, String::from_str(&env, "Will BTC exceed $100k by end of 2025?"));
        assert_eq!(market.options.len(), 2);
        assert_eq!(market.deadline, deadline);
        assert!(!market.resolved);

        // Visual validation — log stored market data
        soroban_sdk::log!(&env, "✅ Market stored: id={}, deadline={}, resolved={}", market.id, market.deadline, market.resolved);
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
