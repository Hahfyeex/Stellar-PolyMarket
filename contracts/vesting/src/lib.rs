#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, contracterror, Address, Env};

/// Duration of storage rent period in ledgers (~10 years)
const LEDGER_TTL_THRESHOLD: u32 = 2_592_000;

/// Error types for vesting contract
#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum VestingError {
    /// Caller is not authorized to perform this action
    Unauthorized = 1,
    /// Beneficiary has already been issued a vesting schedule
    BeneficiaryExists = 2,
    /// Beneficiary does not have a vesting schedule
    BeneficiaryNotFound = 3,
    /// Cliff period has not yet been reached
    CliffNotReached = 4,
    /// Invalid vesting parameters (e.g., duration < cliff)
    InvalidVestingParams = 5,
    /// Amount cannot be zero
    ZeroAmount = 6,
}

/// Storage keys for vesting contract
#[contracttype]
#[derive(Clone, PartialEq, Eq)]
pub enum DataKey {
    /// Admin address (instance storage)
    Admin,
    /// Vesting schedule for a beneficiary (persistent storage)
    VestingSchedule(Address),
}

/// Vesting schedule for a beneficiary
#[contracttype]
#[derive(Clone)]
pub struct VestingSchedule {
    /// Total amount to be vested (in stroops, 7-decimal precision)
    pub total: i128,
    /// Ledger number when cliff is reached
    pub cliff_ledger: u32,
    /// Ledger number when full vesting is complete
    pub end_ledger: u32,
    /// Amount already claimed by beneficiary
    pub claimed: i128,
}

/// Vesting contract for STELLA token allocations
/// Enforces on-chain vesting via cliff and linear release schedules
#[contract]
pub struct VestingContract;

#[contractimpl]
impl VestingContract {
    /// Initialize the vesting contract with an admin address
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `admin` - The address that can create vesting schedules
    ///
    /// # Panics
    /// - If contract is already initialized
    /// - If `admin` does not authorize the call
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();

        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(LEDGER_TTL_THRESHOLD, LEDGER_TTL_THRESHOLD);
    }

    /// Create a vesting schedule for a beneficiary
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `beneficiary` - The address that will receive vested tokens
    /// * `total` - Total amount to vest (in stroops, i128 for 7-decimal precision)
    /// * `cliff_ledgers` - Number of ledgers before cliff is reached
    /// * `duration_ledgers` - Total duration of vesting in ledgers (from start)
    ///
    /// # Panics
    /// - If caller is not authorized
    /// - If beneficiary already has a vesting schedule
    /// - If parameters are invalid (duration < cliff, total or cliff_ledgers is 0)
    pub fn create_vesting(
        env: Env,
        beneficiary: Address,
        total: i128,
        cliff_ledgers: u32,
        duration_ledgers: u32,
    ) {
        // Verify admin authorization
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("{}", VestingError::Unauthorized as u32));
        admin.require_auth();

        // Validate parameters
        if total <= 0 {
            panic!("{}", VestingError::ZeroAmount as u32);
        }
        if cliff_ledgers == 0 || duration_ledgers == 0 {
            panic!("{}", VestingError::InvalidVestingParams as u32);
        }
        if duration_ledgers < cliff_ledgers {
            panic!("{}", VestingError::InvalidVestingParams as u32);
        }

        // Ensure beneficiary doesn't already have a schedule
        let key = DataKey::VestingSchedule(beneficiary.clone());
        if env.storage().persistent().has(&key) {
            panic!("{}", VestingError::BeneficiaryExists as u32);
        }

        // Calculate absolute ledger numbers
        let current_ledger = env.ledger().sequence();
        let cliff_ledger = current_ledger + cliff_ledgers;
        let end_ledger = current_ledger + duration_ledgers;

        // Create and store vesting schedule
        let schedule = VestingSchedule {
            total,
            cliff_ledger,
            end_ledger,
            claimed: 0,
        };

        env.storage().persistent().set(&key, &schedule);

        // Extend TTL on persistent storage
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_THRESHOLD);
    }

    /// Claim vested tokens
    ///
    /// Calculates the vested amount based on the current ledger and vesting schedule:
    /// - Before cliff: panics with `CliffNotReached`
    /// - At/after cliff: releases linear amount based on elapsed time
    /// - After end: releases all remaining tokens
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `beneficiary` - The address claiming their vested tokens
    ///
    /// # Returns
    /// The amount of tokens released in this claim (in stroops)
    ///
    /// # Panics
    /// - If beneficiary doesn't have a vesting schedule
    /// - If cliff hasn't been reached
    /// - If not called by the beneficiary (require_auth)
    pub fn claim_vested(env: Env, beneficiary: Address) -> i128 {
        beneficiary.require_auth();

        let key = DataKey::VestingSchedule(beneficiary.clone());

        // Retrieve vesting schedule
        let mut schedule: VestingSchedule = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("{}", VestingError::BeneficiaryNotFound as u32));

        let current_ledger = env.ledger().sequence();

        // Cliff enforcement: panic if cliff hasn't been reached
        if current_ledger < schedule.cliff_ledger {
            panic!("{}", VestingError::CliffNotReached as u32);
        }

        // Calculate vested amount at current ledger
        let vested = Self::calculate_vested_amount(
            current_ledger,
            schedule.cliff_ledger,
            schedule.end_ledger,
            schedule.total,
        );

        // Calculate claimable amount (vested minus already claimed)
        let claimable = vested - schedule.claimed;

        // If nothing to claim, return 0
        if claimable <= 0 {
            return 0;
        }

        // Update claimed amount
        schedule.claimed = vested;
        env.storage().persistent().set(&key, &schedule);

        // Extend TTL on persistent storage after update
        env.storage()
            .persistent()
            .extend_ttl(&key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_THRESHOLD);

        claimable
    }

    /// Get the current vesting schedule for a beneficiary
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `beneficiary` - The address to query
    ///
    /// # Returns
    /// The vesting schedule, or panics if beneficiary not found
    pub fn get_vesting_schedule(env: Env, beneficiary: Address) -> VestingSchedule {
        let key = DataKey::VestingSchedule(beneficiary);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("{}", VestingError::BeneficiaryNotFound as u32))
    }

    /// Get the amount currently vested for a beneficiary
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `beneficiary` - The address to query
    ///
    /// # Returns
    /// The amount vested so far (in stroops)
    pub fn get_vested_amount(env: Env, beneficiary: Address) -> i128 {
        let schedule = Self::get_vesting_schedule(env.clone(), beneficiary);
        let current_ledger = env.ledger().sequence();

        // Before cliff, return 0
        if current_ledger < schedule.cliff_ledger {
            return 0;
        }

        Self::calculate_vested_amount(
            current_ledger,
            schedule.cliff_ledger,
            schedule.end_ledger,
            schedule.total,
        )
    }

    /// Get the amount currently claimable for a beneficiary
    ///
    /// # Arguments
    /// * `env` - The Soroban environment
    /// * `beneficiary` - The address to query
    ///
    /// # Returns
    /// The amount that can be claimed (vested minus already claimed)
    pub fn get_claimable_amount(env: Env, beneficiary: Address) -> i128 {
        let schedule = Self::get_vesting_schedule(env.clone(), beneficiary);
        let current_ledger = env.ledger().sequence();

        // Before cliff, return 0
        if current_ledger < schedule.cliff_ledger {
            return 0;
        }

        let vested = Self::calculate_vested_amount(
            current_ledger,
            schedule.cliff_ledger,
            schedule.end_ledger,
            schedule.total,
        );

        vested - schedule.claimed
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper functions
    // ─────────────────────────────────────────────────────────────────────────

    /// Calculate the linearly vested amount at a given ledger
    ///
    /// Formula:
    /// - If ledger < cliff_ledger: 0
    /// - If ledger >= end_ledger: total
    /// - Otherwise: total * (ledger - cliff_ledger) / (end_ledger - cliff_ledger)
    ///
    /// Uses i128 arithmetic to maintain 7-decimal precision without floats
    fn calculate_vested_amount(
        current_ledger: u32,
        cliff_ledger: u32,
        end_ledger: u32,
        total: i128,
    ) -> i128 {
        // Before cliff: 0
        if current_ledger < cliff_ledger {
            return 0;
        }

        // After end: total
        if current_ledger >= end_ledger {
            return total;
        }

        // Linear interpolation: total * (current - cliff) / (end - cliff)
        let elapsed = (current_ledger - cliff_ledger) as i128;
        let duration = (end_ledger - cliff_ledger) as i128;

        // Integer division maintains precision for stroops (7 decimal places)
        (total * elapsed) / duration
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    /// Returns (env, client, admin). Uses the generated client so auth mocking
    /// works correctly across separate contract invocations.
    fn setup() -> (Env, VestingContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(VestingContract, ());
        let client = VestingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        // SAFETY: env lifetime is tied to the returned client; caller must not
        // drop env before client. In tests this is always the case.
        let client = unsafe {
            core::mem::transmute::<VestingContractClient<'_>, VestingContractClient<'static>>(client)
        };
        (env, client, admin)
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(VestingContract, ());
        let client = VestingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
    }

    #[test]
    #[should_panic(expected = "Already initialized")]
    fn test_initialize_twice_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(VestingContract, ());
        let client = VestingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin);
    }

    #[test]
    fn test_create_vesting_success() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);
        let total = 100_000_000_000i128;

        env.ledger().set_sequence_number(100);
        client.create_vesting(&beneficiary, &total, &1000, &10000);

        let schedule = client.get_vesting_schedule(&beneficiary);
        assert_eq!(schedule.total, total);
        assert_eq!(schedule.claimed, 0);
        assert_eq!(schedule.cliff_ledger, 1100);
        assert_eq!(schedule.end_ledger, 10100);
    }

    #[test]
    #[should_panic(expected = "6")]
    fn test_create_vesting_invalid_zero_total() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);
        client.create_vesting(&beneficiary, &0, &1000, &10000);
    }

    #[test]
    #[should_panic(expected = "5")]
    fn test_create_vesting_invalid_zero_cliff() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);
        client.create_vesting(&beneficiary, &100_000_000_000, &0, &10000);
    }

    #[test]
    #[should_panic(expected = "5")]
    fn test_create_vesting_invalid_duration_less_than_cliff() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);
        client.create_vesting(&beneficiary, &100_000_000_000, &10000, &5000);
    }

    #[test]
    #[should_panic(expected = "2")]
    fn test_create_vesting_duplicate_beneficiary() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);
        client.create_vesting(&beneficiary, &100_000_000_000, &1000, &10000);
        client.create_vesting(&beneficiary, &100_000_000_000, &1000, &10000);
    }

    #[test]
    #[should_panic(expected = "4")]
    fn test_claim_before_cliff_panics() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);

        env.ledger().set_sequence_number(100);
        client.create_vesting(&beneficiary, &100_000_000_000, &1000, &10000);

        env.ledger().set_sequence_number(200);
        client.claim_vested(&beneficiary);
    }

    #[test]
    fn test_claim_at_cliff_releases_zero() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);

        env.ledger().set_sequence_number(0);
        client.create_vesting(&beneficiary, &100_000_000_000, &1000, &10000);

        env.ledger().set_sequence_number(1000);
        assert_eq!(client.claim_vested(&beneficiary), 0);
    }

    #[test]
    fn test_claim_at_mid_vesting() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);

        env.ledger().set_sequence_number(0);
        client.create_vesting(&beneficiary, &100_000_000_000, &1000, &10000);

        env.ledger().set_sequence_number(5500);
        assert_eq!(client.claim_vested(&beneficiary), 50_000_000_000);
        // second claim at same ledger yields 0
        assert_eq!(client.claim_vested(&beneficiary), 0);
    }

    #[test]
    fn test_claim_after_full_vesting() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);
        let total = 100_000_000_000i128;

        env.ledger().set_sequence_number(0);
        client.create_vesting(&beneficiary, &total, &1000, &10000);

        env.ledger().set_sequence_number(20000);
        assert_eq!(client.claim_vested(&beneficiary), total);
        assert_eq!(client.claim_vested(&beneficiary), 0);
    }

    #[test]
    #[should_panic(expected = "3")]
    fn test_claim_nonexistent_beneficiary() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);
        client.claim_vested(&beneficiary);
    }

    #[test]
    fn test_get_vested_amount_before_cliff() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);

        env.ledger().set_sequence_number(0);
        client.create_vesting(&beneficiary, &100_000_000_000, &1000, &10000);

        env.ledger().set_sequence_number(500);
        assert_eq!(client.get_vested_amount(&beneficiary), 0);
    }

    #[test]
    fn test_get_vested_amount_after_cliff() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);

        env.ledger().set_sequence_number(0);
        client.create_vesting(&beneficiary, &100_000_000_000, &1000, &10000);

        env.ledger().set_sequence_number(5500);
        assert_eq!(client.get_vested_amount(&beneficiary), 50_000_000_000);
    }

    #[test]
    fn test_get_claimable_amount() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);

        env.ledger().set_sequence_number(0);
        client.create_vesting(&beneficiary, &100_000_000_000, &1000, &10000);

        env.ledger().set_sequence_number(5500);
        assert_eq!(client.get_claimable_amount(&beneficiary), 50_000_000_000);

        client.claim_vested(&beneficiary);
        assert_eq!(client.get_claimable_amount(&beneficiary), 0);
    }

    #[test]
    fn test_linear_vesting_progression() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);
        let total = 100_000_000_000i128;

        env.ledger().set_sequence_number(0);
        client.create_vesting(&beneficiary, &total, &1000, &10000);

        env.ledger().set_sequence_number(3250);
        assert_eq!(client.get_vested_amount(&beneficiary), 25_000_000_000);

        env.ledger().set_sequence_number(5500);
        assert_eq!(client.get_vested_amount(&beneficiary), 50_000_000_000);

        env.ledger().set_sequence_number(7750);
        assert_eq!(client.get_vested_amount(&beneficiary), 75_000_000_000);

        env.ledger().set_sequence_number(10000);
        assert_eq!(client.get_vested_amount(&beneficiary), total);
    }

    #[test]
    fn test_multiple_beneficiaries() {
        let (env, client, _admin) = setup();
        let b1 = Address::generate(&env);
        let b2 = Address::generate(&env);

        env.ledger().set_sequence_number(0);
        client.create_vesting(&b1, &50_000_000_000, &1000, &10000);
        client.create_vesting(&b2, &75_000_000_000, &2000, &12000);

        env.ledger().set_sequence_number(5500);
        assert_eq!(client.get_vested_amount(&b1), 25_000_000_000);
        assert_eq!(client.get_vested_amount(&b2), 26_250_000_000);
    }

    #[test]
    fn test_cliff_and_linear_vesting_full_cycle() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);
        let total = 1_000_000_000_000i128;

        env.ledger().set_sequence_number(100);
        client.create_vesting(&beneficiary, &total, &5000, &50000);

        // before cliff
        env.ledger().set_sequence_number(2000);
        assert_eq!(client.get_vested_amount(&beneficiary), 0);

        // exactly at cliff (elapsed = 0)
        env.ledger().set_sequence_number(5100);
        assert_eq!(client.get_vested_amount(&beneficiary), 0);

        // one ledger past cliff
        env.ledger().set_sequence_number(5101);
        assert_eq!(client.get_vested_amount(&beneficiary), total / 45000);

        // midpoint
        env.ledger().set_sequence_number(27600);
        assert_eq!(client.get_vested_amount(&beneficiary), 500_000_000_000);

        // past end
        env.ledger().set_sequence_number(50100);
        assert_eq!(client.get_vested_amount(&beneficiary), total);

        // well past end
        env.ledger().set_sequence_number(100000);
        assert_eq!(client.get_vested_amount(&beneficiary), total);
    }

    #[test]
    fn test_ttl_extension_on_storage_writes() {
        let (env, client, _admin) = setup();
        let beneficiary = Address::generate(&env);

        env.ledger().set_sequence_number(0);
        client.create_vesting(&beneficiary, &100_000_000_000, &1000, &10000);

        env.ledger().set_sequence_number(5500);
        client.claim_vested(&beneficiary);
    }
}
