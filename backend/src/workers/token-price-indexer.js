/**
 * token-price-indexer.js
 *
 * Polls the Soroban RPC for Mint and Burn events emitted by the prediction
 * market contract and persists them to the `token_trades` table.
 *
 * Indexing strategy
 * ─────────────────
 * • Mint event  → user buys a position token (price = amount_xlm / shares_minted)
 * • Burn event  → user sells / redeems a position token (price = amount_xlm / shares_burned)
 *
 * Both events carry: [market_id, outcome_index, wallet, amount_xlm, shares]
 * The token_id is derived as "<market_id>-<outcome_index>".
 *
 * The worker tracks the last processed ledger in Redis so it survives restarts
 * without re-indexing the entire chain.
 */

"use strict";

const { SorobanRpc, xdr, StrKey } = require("@stellar/stellar-sdk");
const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");
require("dotenv").config();

const RPC_URL = process.env.RPC_URL || "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.CONTRACT_ID || "";
const POLL_INTERVAL = parseInt(process.env.TOKEN_INDEXER_POLL_MS, 10) || 4000;
const LEDGER_CURSOR_KEY = "token_indexer:last_ledger";

const server = new SorobanRpc.Server(RPC_URL);

/**
 * Decode an i128 ScVal to a JS number (XLM, divided by 1e7 for stroops→XLM).
 * Returns 0 on failure.
 */
function decodeI128ToXLM(scVal) {
  try {
    if (scVal.switch() === xdr.ScValType.scvI128()) {
      const hi = BigInt(scVal.i128().hi().toString());
      const lo = BigInt(scVal.i128().lo().toString());
      const stroops = (hi << 64n) | lo;
      return Number(stroops) / 1e7;
    }
    if (scVal.switch() === xdr.ScValType.scvU64()) {
      return Number(scVal.u64().toString()) / 1e7;
    }
    if (scVal.switch() === xdr.ScValType.scvI64()) {
      return Number(scVal.i64().toString()) / 1e7;
    }
  } catch (_) {
    // fall through
  }
  return 0;
}

/**
 * Decode a u32 ScVal to a JS number.
 */
function decodeU32(scVal) {
  try {
    if (scVal.switch() === xdr.ScValType.scvU32()) return scVal.u32();
    if (scVal.switch() === xdr.ScValType.scvI32()) return scVal.i32();
  } catch (_) {
    // fall through
  }
  return 0;
}

/**
 * Decode an Address ScVal to a Stellar public key string.
 */
function decodeAddress(scVal) {
  try {
    const addr = scVal.address();
    if (addr.switch() === xdr.ScAddressType.scAddressTypeAccount()) {
      return StrKey.encodeEd25519PublicKey(addr.accountId().ed25519());
    }
    if (addr.switch() === xdr.ScAddressType.scAddressTypeContract()) {
      return StrKey.encodeContract(addr.contractId());
    }
  } catch (_) {
    // fall through
  }
  return "unknown";
}

/**
 * Parse a Mint or Burn event and persist it to the DB.
 *
 * Expected event structure (matches contract emit pattern):
 *   topics: [Symbol("mint"|"burn"), u32(market_id), u32(outcome_index)]
 *   value:  Vec[Address(wallet), i128(amount_xlm_stroops), i128(shares)]
 */
async function processTradeEvent(event, eventType) {
  try {
    const topics = event.topic || [];
    if (topics.length < 3) return;

    const marketIdVal = xdr.ScVal.fromXDR(topics[1], "base64");
    const outcomeVal = xdr.ScVal.fromXDR(topics[2], "base64");

    const marketId = decodeU32(marketIdVal).toString();
    const outcomeIndex = decodeU32(outcomeVal);
    const tokenId = `${marketId}-${outcomeIndex}`;

    const dataVal = xdr.ScVal.fromXDR(event.value, "base64");
    if (dataVal.switch() !== xdr.ScValType.scvVec() || !dataVal.vec()) return;

    const vec = dataVal.vec();
    if (vec.length < 3) return;

    const walletAddress = decodeAddress(vec[0]);
    const amountXLM = decodeI128ToXLM(vec[1]);   // total XLM paid/received
    const shares = decodeI128ToXLM(vec[2]);       // tokens minted/burned

    if (shares <= 0 || amountXLM < 0) return;

    const priceXLM = amountXLM / shares;          // price per token
    const ledger = event.ledger ?? 0;
    const txHash = event.txHash ?? event.id ?? "unknown";

    await db.query(
      `INSERT INTO token_trades
         (token_id, market_id, outcome_index, event_type, price_xlm, volume, wallet_address, ledger, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING`,
      [tokenId, marketId, outcomeIndex, eventType, priceXLM, shares, walletAddress, ledger, txHash]
    );

    logger.info(
      { token_id: tokenId, event_type: eventType, price_xlm: priceXLM, volume: shares, ledger },
      "Token trade indexed"
    );
  } catch (err) {
    logger.error({ err, event_type: eventType }, "Failed to process trade event");
  }
}

/**
 * Main polling loop. Fetches Mint/Burn events from the Soroban RPC and
 * persists them. Tracks the last processed ledger in Redis.
 */
async function startIndexer() {
  if (!CONTRACT_ID) {
    logger.warn("CONTRACT_ID not set — token price indexer will not start");
    return;
  }

  let lastLedger = 0;

  // Resume from last known ledger if available
  try {
    const cached = await redis.get(LEDGER_CURSOR_KEY);
    if (cached) lastLedger = parseInt(cached, 10);
  } catch (_) {
    // Redis unavailable — start from latest
  }

  if (lastLedger === 0) {
    try {
      const latest = await server.getLatestLedger();
      lastLedger = latest.sequence;
    } catch (err) {
      logger.error({ err }, "Failed to get latest ledger for token indexer");
      return;
    }
  }

  logger.info({ last_ledger: lastLedger, contract_id: CONTRACT_ID }, "Token price indexer started");

  setInterval(async () => {
    try {
      const current = await server.getLatestLedger();
      if (current.sequence <= lastLedger) return;

      const mintTopic = xdr.ScVal.scvSymbol("mint").toXDR("base64");
      const burnTopic = xdr.ScVal.scvSymbol("burn").toXDR("base64");

      const response = await server.getEvents({
        startLedger: lastLedger + 1,
        filters: [
          { type: "contract", contractIds: [CONTRACT_ID], topics: [mintTopic] },
          { type: "contract", contractIds: [CONTRACT_ID], topics: [burnTopic] },
        ],
        pagination: { limit: 200 },
      });

      if (response.events?.length) {
        for (const event of response.events) {
          const topicVal = xdr.ScVal.fromXDR(event.topic[0], "base64");
          const sym = topicVal.switch() === xdr.ScValType.scvSymbol()
            ? topicVal.sym().toString()
            : null;

          if (sym === "mint") await processTradeEvent(event, "mint");
          else if (sym === "burn") await processTradeEvent(event, "burn");
        }
      }

      lastLedger = current.sequence;
      await redis.set(LEDGER_CURSOR_KEY, lastLedger.toString()).catch(() => {});
    } catch (err) {
      logger.error({ err }, "Token price indexer poll error");
    }
  }, POLL_INTERVAL);
}

module.exports = { startIndexer, processTradeEvent, decodeI128ToXLM, decodeU32, decodeAddress };

if (require.main === module) {
  startIndexer();
}
