#![cfg(test)]

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger as _},
    token, TryFromVal, Symbol,
};
use stellar_strkey::{ed25519, Strkey};

fn account_address_from_signing_key(env: &Env, signing_key: &SigningKey) -> Address {
    let strkey = Strkey::PublicKeyEd25519(ed25519::PublicKey(signing_key.verifying_key().to_bytes()))
        .to_string();
    Address::from_string(&String::from_str(env, &strkey))
}

fn setup_contract() -> (Env, Address, PredictionMarketClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PredictionMarket, ());
    let client = PredictionMarketClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    (env, admin, client)
}

fn setup_market_for_signed_bet() -> (Env, PredictionMarketClient<'static>, Address, SigningKey) {
    let (env, admin, client) = setup_contract();

    client.assign_role(&admin, &Role::FeeSetter, &admin);

    let creator = Address::generate(&env);
    client.assign_role(&admin, &Role::Pauser, &creator);

    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin);
    let token_addr = sac.address();
    client.set_token_whitelist(&admin, &token_addr, &true);

    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let bettor = account_address_from_signing_key(&env, &signing_key);
    token::StellarAssetClient::new(&env, &token_addr).mint(&bettor, &50_000_000_000i128);

    let deadline = env.ledger().timestamp() + 7_200;
    let options = vec![
        &env,
        String::from_str(&env, "Yes"),
        String::from_str(&env, "No"),
    ];

    client.create_market(
        &creator,
        &1u64,
        &String::from_str(&env, "Will Stellar close above the weekly open?"),
        &options,
        &deadline,
        &token_addr,
        &10_000_000i128,
        &None,
        &None,
    );

    (env, client, bettor, signing_key)
}

fn sign_bet(
    env: &Env,
    signing_key: &SigningKey,
    market_id: u64,
    option_index: u32,
    bettor: &Address,
    amount: i128,
    nonce: u64,
) -> BytesN<64> {
    let payload = bet_signature_payload(env, market_id, option_index, bettor, amount, nonce);
    let mut raw_payload = [0u8; payload.len() as usize];
    payload.copy_into_slice(&mut raw_payload);
    let signature = signing_key.sign(&raw_payload);
    BytesN::from_array(env, &signature.to_bytes())
}

fn latest_contract_event_topic(env: &Env) -> Symbol {
    let events = env.events().all();
    let (_, topics, _) = events.last().unwrap();
    Symbol::try_from_val(env, &topics.get(0).unwrap()).unwrap()
}

#[test]
fn get_nonce_defaults_to_zero() {
    let (env, _, client) = setup_contract();
    let address = Address::generate(&env);
    assert_eq!(client.get_nonce(&address), 0);
}

#[test]
fn valid_signature_increments_nonce() {
    let (env, client, bettor, signing_key) = setup_market_for_signed_bet();

    let signature = sign_bet(&env, &signing_key, 1, 0, &bettor, 100, 0);
    client.place_bet_with_sig(&1u64, &0u32, &bettor, &100i128, &0u64, &signature);

    assert_eq!(client.get_nonce(&bettor), 1);
}

#[test]
#[should_panic(expected = "invalid nonce: replay detected")]
fn replayed_signature_is_rejected() {
    let (env, client, bettor, signing_key) = setup_market_for_signed_bet();

    let signature = sign_bet(&env, &signing_key, 1, 0, &bettor, 100, 0);
    client.place_bet_with_sig(&1u64, &0u32, &bettor, &100i128, &0u64, &signature);
    client.place_bet_with_sig(&1u64, &0u32, &bettor, &100i128, &0u64, &signature);
}

#[test]
#[should_panic(expected = "invalid nonce: replay detected")]
fn out_of_order_nonce_is_rejected() {
    let (env, client, bettor, signing_key) = setup_market_for_signed_bet();

    let signature = sign_bet(&env, &signing_key, 1, 0, &bettor, 100, 1);
    client.place_bet_with_sig(&1u64, &0u32, &bettor, &100i128, &1u64, &signature);
}

#[test]
fn super_admin_can_propose_and_cancel_upgrade() {
    let (env, admin, client) = setup_contract();
    let wasm_hash = env.deployer().upload_contract_wasm([].as_slice());

    client.propose_upgrade(&admin, &wasm_hash);
    assert_eq!(latest_contract_event_topic(&env), symbol_short!("UpProp"));

    client.cancel_upgrade(&admin);
    assert_eq!(latest_contract_event_topic(&env), symbol_short!("UpCancl"));
}

#[test]
#[should_panic(expected = "upgrade timelock is still active")]
fn execute_upgrade_before_unlock_panics() {
    let (env, admin, client) = setup_contract();
    let wasm_hash = env.deployer().upload_contract_wasm([].as_slice());

    client.propose_upgrade(&admin, &wasm_hash);
    client.execute_upgrade(&admin);
}

#[test]
fn execute_upgrade_after_timelock_succeeds_and_emits_event() {
    let (env, admin, client) = setup_contract();
    let wasm_hash = env.deployer().upload_contract_wasm([].as_slice());

    client.propose_upgrade(&admin, &wasm_hash);
    env.ledger().with_mut(|ledger| {
        ledger.sequence_number += UPGRADE_TIMELOCK_LEDGERS;
    });

    client.execute_upgrade(&admin);
    assert_eq!(latest_contract_event_topic(&env), symbol_short!("Upgrade"));
}

#[test]
#[should_panic(expected = "AccessDenied")]
fn only_super_admin_can_propose_execute_and_cancel_upgrade() {
    let (env, admin, client) = setup_contract();
    let attacker = Address::generate(&env);
    let wasm_hash = env.deployer().upload_contract_wasm([].as_slice());

    client.propose_upgrade(&admin, &wasm_hash);
    client.cancel_upgrade(&attacker);
}
