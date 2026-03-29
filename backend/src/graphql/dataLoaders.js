/**
 * graphql/dataLoaders.js
 *
 * DataLoader instances for batching DB queries and preventing N+1 problems.
 * A fresh set of loaders is created per request (per Apollo context call).
 */

"use strict";

const DataLoader = require("dataloader");
const db = require("../db");

/**
 * Batch-load markets by an array of ids.
 * Returns rows in the same order as the input ids.
 */
function createMarketLoader() {
  return new DataLoader(async (ids) => {
    const { rows } = await db.query("SELECT * FROM markets WHERE id = ANY($1::int[])", [ids]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId[id] ?? null);
  });
}

/**
 * Batch-load bets grouped by market_id.
 * Returns an array of bet arrays, one per market_id.
 */
function createBetsByMarketLoader() {
  return new DataLoader(async (marketIds) => {
    const { rows } = await db.query(
      "SELECT * FROM bets WHERE market_id = ANY($1::int[]) ORDER BY created_at DESC",
      [marketIds]
    );
    const byMarket = {};
    for (const row of rows) {
      (byMarket[row.market_id] ??= []).push(row);
    }
    return marketIds.map((id) => byMarket[id] ?? []);
  });
}

/**
 * Batch-load bets grouped by wallet_address.
 */
function createBetsByWalletLoader() {
  return new DataLoader(async (wallets) => {
    const { rows } = await db.query(
      "SELECT * FROM bets WHERE wallet_address = ANY($1::text[]) ORDER BY created_at DESC",
      [wallets]
    );
    const byWallet = {};
    for (const row of rows) {
      (byWallet[row.wallet_address] ??= []).push(row);
    }
    return wallets.map((w) => byWallet[w] ?? []);
  });
}

/**
 * Batch-load bet counts grouped by market_id.
 */
function createBetCountLoader() {
  return new DataLoader(async (marketIds) => {
    const { rows } = await db.query(
      "SELECT market_id, COUNT(*) AS count FROM bets WHERE market_id = ANY($1::int[]) GROUP BY market_id",
      [marketIds]
    );
    const byMarket = Object.fromEntries(rows.map((r) => [r.market_id, parseInt(r.count)]));
    return marketIds.map((id) => byMarket[id] ?? 0);
  });
}

function createLoaders() {
  return {
    market: createMarketLoader(),
    betsByMarket: createBetsByMarketLoader(),
    betsByWallet: createBetsByWalletLoader(),
    betCount: createBetCountLoader(),
  };
}

module.exports = { createLoaders };
