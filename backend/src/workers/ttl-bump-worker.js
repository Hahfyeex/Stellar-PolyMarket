const {
  Contract,
  TransactionBuilder,
  Networks,
  Keypair,
  rpc,
  xdr,
} = require("@stellar/stellar-sdk");
const db = require("../db");
const logger = require("../utils/logger");

/**
 * Soroban TTL Extension Worker
 * Periodically calls the contract's 'bump_market_ttl' function
 * to prevent market data from expiring on the ledger.
 */

// Deployment Config (Ideally from .env)
const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.SOROBAN_CONTRACT_ID;
const NETWORK_PASSPHRASE = process.env.SOROBAN_NETWORK_PASSPHRASE || Networks.TESTNET;
const ADMIN_SECRET = process.env.SOROBAN_ADMIN_SECRET;

const server = new rpc.Server(RPC_URL);

async function bumpAllMarketTTLs() {
  if (!CONTRACT_ID || !ADMIN_SECRET) {
      logger.warn("SOROBAN_CONTRACT_ID or SOROBAN_ADMIN_SECRET missing. Skipping TTL bump.");
      return;
  }

  logger.info("Starting weekly Soroban TTL bump...");

  try {
    const adminKeypair = Keypair.fromSecret(ADMIN_SECRET);
    const contract = new Contract(CONTRACT_ID);

    // 1. Fetch all unresolved market IDs from local indexer
    const markets = await db.query("SELECT id FROM markets WHERE resolved = FALSE");
    
    for (const market of markets.rows) {
      const marketId = BigInt(market.id);
      logger.info({ market_id: market.id }, "Bumping TTL for market...");

      // Threshold: 10,000 ledgers (~10 hours)
      // Extend to: 100,000 ledgers (~4 days)
      const call = contract.call("bump_market_ttl", 
          xdr.ScVal.scvU64(marketId), 
          xdr.ScVal.scvU32(10000), 
          xdr.ScVal.scvU32(100000)
      );

      const account = await server.getLatestLedger().then(l => server.getAccount(adminKeypair.publicKey()));
      const tx = new TransactionBuilder(account, {
        fee: "100000",
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(call)
        .setTimeout(30)
        .build();

      tx.sign(adminKeypair);
      
      const response = await server.sendTransaction(tx);
      if (response.status === "PENDING" || response.status === "SUCCESS") {
          logger.info({ market_id: market.id, tx_hash: response.hash }, "TTL bump transaction submitted");
      } else {
          logger.error({ market_id: market.id, response }, "Failed to submit TTL bump transaction");
      }
    }
  } catch (err) {
    logger.error({ err }, "TTL Extension Worker failed");
  }
}

// Simple weekly throttle (if run in a frequently called environment)
// or just export to be called by an external cron.
module.exports = { bumpAllMarketTTLs };

if (require.main === module) {
    bumpAllMarketTTLs().then(() => process.exit(0));
}
