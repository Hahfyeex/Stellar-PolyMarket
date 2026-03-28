/**
 * utils/sorobanClient.js
 *
 * Soroban contract interaction utilities.
 * Provides read-only calls to check market status on-chain.
 */

"use strict";

const { SorobanRpc, xdr, nativeToScVal } = require("@stellar/stellar-sdk");
const logger = require("./logger");
const redis = require("./redisClient");

const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.SOROBAN_CONTRACT_ID || "";
const RPC_TIMEOUT = 5000; // 5 seconds

const server = new SorobanRpc.Server(RPC_URL);

/**
 * Get market status from on-chain contract.
 * Caches result in Redis for 30 seconds.
 *
 * @param {number} marketId - Market ID
 * @returns {Promise<string>} - Status: 'Active', 'Paused', 'Voided', etc.
 */
async function getMarketStatus(marketId) {
  if (!CONTRACT_ID) {
    logger.warn("SOROBAN_CONTRACT_ID not set, skipping on-chain validation");
    return null;
  }

  const cacheKey = `market_status:${marketId}`;

  try {
    // Check Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ marketId, cached_status: cached }, "Market status from cache");
      return cached;
    }

    // Make read-only call to contract
    const status = await callGetMarketStatus(marketId);

    // Cache for 30 seconds
    await redis.set(cacheKey, status, "EX", 30);

    logger.debug({ marketId, status }, "Market status from on-chain");
    return status;
  } catch (err) {
    logger.error(
      { marketId, error: err.message },
      "Failed to get market status from on-chain, will fall back to database"
    );
    return null; // Return null to signal fallback to database
  }
}

/**
 * Call get_market_status on the Soroban contract.
 * This is a read-only invocation.
 *
 * @param {number} marketId
 * @returns {Promise<string>}
 */
async function callGetMarketStatus(marketId) {
  try {
    // Build the contract invocation
    const args = [nativeToScVal(marketId, { type: "u32" })];

    const contract = new SorobanRpc.Contract(CONTRACT_ID);
    const call = contract.call("get_market_status", ...args);

    // Simulate the transaction to get the result
    const account = {
      accountId: CONTRACT_ID,
      sequenceNumber: "0",
    };

    const tx = new SorobanRpc.TransactionBuilder(account, {
      fee: 100,
      networkPassphrase: "Test SDF Network ; September 2015",
    })
      .addOperation(call)
      .setTimeout(30)
      .build();

    const simulated = await Promise.race([
      server.simulateTransaction(tx),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("RPC timeout")), RPC_TIMEOUT)
      ),
    ]);

    if (simulated.error) {
      throw new Error(`Simulation error: ${simulated.error}`);
    }

    // Extract result from simulation
    const result = simulated.results?.[0]?.result?.retval;
    if (!result) {
      throw new Error("No result from contract call");
    }

    // Parse the result (assuming it's a string status)
    const status = result.sym()?.toString() || result.str()?.toString() || "Unknown";
    return status;
  } catch (err) {
    logger.error({ error: err.message }, "Contract call failed");
    throw err;
  }
}

module.exports = {
  getMarketStatus,
};
