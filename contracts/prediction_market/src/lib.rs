#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Map, String, Vec,
};

#[contracttype]
pub enum DataKey {
    Market(u64),
    Bets(u64),       // Map<Address, (u32, i128)> — outcome_index + amount
    TotalPool(u64),
    Admin,
}

#[contracttype]
#[derive(Clone)]
pub struct Market {
    pub id: u64,
    pub question: String,
    pub end_date: u64,
    pub outcomes: Vec<String>,
    pub resolved: bool,
    pub winning_outcome: u32,
    pub token: Address,
}

#[contract]
pub struct PredictionMarket;

#[contractimpl]
impl PredictionMarket {
    /// Initialize contract with admin address
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Create a new prediction market
    pub fn create_market(
        env: Env,
        id: u64,
        question: String,
        end_date: u64,
        outcomes: Vec<String>,
        token: Address,
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        assert!(!env.storage().instance().has(&DataKey::Market(id)), "Market already exists");
        assert!(outcomes.len() >= 2, "Need at least 2 outcomes");
        assert!(end_date > env.ledger().timestamp(), "End date must be in the future");

        let market = Market {
            id,
            question,
            end_date,
            outcomes,
            resolved: false,
            winning_outcome: 0,
            token,
        };

        env.storage().instance().set(&DataKey::Market(id), &market);
        env.storage().instance().set(&DataKey::TotalPool(id), &0i128);
        env.storage()
            .instance()
            .set(&DataKey::Bets(id), &Map::<Address, (u32, i128)>::new(&env));
    }

    /// Place a bet on an outcome — transfers tokens into the contract
    pub fn place_bet(env: Env, market_id: u64, outcome_index: u32, bettor: Address, amount: i128) {
        bettor.require_auth();
        assert!(amount > 0, "Amount must be positive");

        let market: Market = env
            .storage()
            .instance()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(!market.resolved, "Market already resolved");
        assert!(
            env.ledger().timestamp() < market.end_date,
            "Market has ended"
        );
        assert!(
            (outcome_index as u32) < market.outcomes.len(),
            "Invalid outcome"
        );

        // Transfer tokens from bettor to contract
        let token_client = token::Client::new(&env, &market.token);
        token_client.transfer(&bettor, &env.current_contract_address(), &amount);

        // Record bet
        let mut bets: Map<Address, (u32, i128)> = env
            .storage()
            .instance()
            .get(&DataKey::Bets(market_id))
            .unwrap();
        bets.set(bettor, (outcome_index, amount));
        env.storage().instance().set(&DataKey::Bets(market_id), &bets);

        // Update pool
        let pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalPool(market_id))
            .unwrap();
        env.storage()
            .instance()
            .set(&DataKey::TotalPool(market_id), &(pool + amount));
    }

    /// Resolve market — only admin (oracle-triggered)
    pub fn resolve_market(env: Env, market_id: u64, winning_outcome: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut market: Market = env
            .storage()
            .instance()
            .get(&DataKey::Market(market_id))
            .unwrap();

        assert!(!market.resolved, "Already resolved");
        assert!(
            (winning_outcome as u32) < market.outcomes.len(),
            "Invalid outcome"
        );

        market.resolved = true;
        market.winning_outcome = winning_outcome;
        env.storage()
            .instance()
            .set(&DataKey::Market(market_id), &market);
    }

    /// Distribute rewards proportionally to winners (3% platform fee)
    pub fn distribute_rewards(env: Env, market_id: u64) {
        let market: Market = env
            .storage()
            .instance()
            .get(&DataKey::Market(market_id))
            .unwrap();
        assert!(market.resolved, "Market not resolved yet");

        let bets: Map<Address, (u32, i128)> = env
            .storage()
            .instance()
            .get(&DataKey::Bets(market_id))
            .unwrap();

        let total_pool: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalPool(market_id))
            .unwrap();

        // Calculate total winning stake
        let mut winning_stake: i128 = 0;
        for (_, (outcome, amount)) in bets.iter() {
            if outcome == market.winning_outcome {
                winning_stake += amount;
            }
        }

        if winning_stake == 0 {
            return; // No winners — pool stays in contract
        }

        let payout_pool = total_pool * 97 / 100; // 3% fee
        let token_client = token::Client::new(&env, &market.token);

        for (bettor, (outcome, amount)) in bets.iter() {
            if outcome == market.winning_outcome {
                let payout = (amount * payout_pool) / winning_stake;
                token_client.transfer(&env.current_contract_address(), &bettor, &payout);
            }
        }
    }

    /// Read a market
    pub fn get_market(env: Env, market_id: u64) -> Market {
        env.storage()
            .instance()
            .get(&DataKey::Market(market_id))
            .unwrap()
    }

    /// Get total pool for a market
    pub fn get_pool(env: Env, market_id: u64) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalPool(market_id))
            .unwrap_or(0)
    }
}
