'use strict';

/**
 * stellarResolver.js — Stellar SDK bridge to the on-chain resolve_market function.
 *
 * Builds, signs, and submits a Soroban transaction that calls:
 *   resolve_market(market_id: u64, winning_outcome: u32)
 *
 * Security rules:
 *   - Oracle keypair is ALWAYS read from environment variables at call time.
 *   - The secret key is NEVER logged, stored, or included in error messages.
 *   - If ORACLE_SECRET_KEY is absent the function throws immediately.
 *
 * Environment variables:
 *   ORACLE_SECRET_KEY   — Stellar secret key (S...) for the oracle account
 *   STELLAR_RPC_URL     — Soroban RPC endpoint
 *   STELLAR_NETWORK     — "mainnet" | "testnet" (default: testnet)
 *   CONTRACT_ID         — Soroban contract address
 */

const {
  Keypair,
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  xdr,
} = require('@stellar/stellar-sdk');

const RPC_URL     = process.env.STELLAR_RPC_URL  || 'https://soroban-testnet.stellar.org';
const NETWORK     = process.env.STELLAR_NETWORK  || 'testnet';
const CONTRACT_ID = process.env.CONTRACT_ID      || '';

const NETWORK_PASSPHRASE = NETWORK === 'mainnet'
  ? Networks.PUBLIC
  : Networks.TESTNET;

/**
 * Load the oracle keypair from env. Throws (without logging the key) if absent.
 * @returns {Keypair}
 */
function loadKeypair() {
  const secret = process.env.ORACLE_SECRET_KEY;
  if (!secret) throw new Error('ORACLE_SECRET_KEY environment variable is not set');
  try {
    return Keypair.fromSecret(secret);
  } catch {
    // Do NOT include the secret value in the error message
    throw new Error('ORACLE_SECRET_KEY is set but is not a valid Stellar secret key');
  }
}

/**
 * Submit resolve_market(market_id, winning_outcome) to the Soroban contract.
 *
 * @param {number|bigint} marketId       — u64 market identifier
 * @param {number}        winningOutcome — u32 outcome index
 * @returns {Promise<string>}            — transaction hash on success
 * @throws on RPC error or simulation failure
 */
async function resolveMarketOnChain(marketId, winningOutcome) {
  if (!CONTRACT_ID) throw new Error('CONTRACT_ID environment variable is not set');

  const keypair = loadKeypair();
  const server  = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
  const account = await server.getAccount(keypair.publicKey());

  const contract = new Contract(CONTRACT_ID);

  // Build the invoke-contract operation
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'resolve_market',
        nativeToScVal(BigInt(marketId), { type: 'u64' }),
        nativeToScVal(winningOutcome,   { type: 'u32' }),
      )
    )
    .setTimeout(30)
    .build();

  // Simulate to get the footprint / resource fee
  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  // Assemble (attach auth + resource fee) and sign
  const prepared = SorobanRpc.assembleTransaction(tx, simResult).build();
  prepared.sign(keypair);

  // Submit
  const sendResult = await server.sendTransaction(prepared);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Poll for confirmation
  const txHash = sendResult.hash;
  let getResult = await server.getTransaction(txHash);
  let attempts  = 0;
  const MAX_POLL = 20;

  while (getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND && attempts < MAX_POLL) {
    await new Promise(r => setTimeout(r, 1500));
    getResult = await server.getTransaction(txHash);
    attempts++;
  }

  if (getResult.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction did not succeed. Status: ${getResult.status}, hash: ${txHash}`);
  }

  return txHash;
}

module.exports = { resolveMarketOnChain, loadKeypair };
