/**
 * graphql/resolvers.js
 *
 * GraphQL resolvers backed by PostgreSQL.
 * Field resolvers use DataLoaders from context to prevent N+1 queries.
 * All queries use parameterised statements to prevent SQL injection.
 */

"use strict";

const db = require("../db");
const pubsub = require("./pubsub");

const clamp = (n, max = 200) => Math.min(Math.max(parseInt(n) || 50, 1), max);

const LEADERBOARD_TYPES = ["accuracy", "volume", "winnings"];

const resolvers = {
  Query: {
    async market(_, { id }) {
      const { rows } = await db.query("SELECT * FROM markets WHERE id = $1", [id]);
      return rows[0] ?? null;
    },

    async markets(_, { status, category, limit, offset = 0 }) {
      const conditions = [];
      const params = [];

      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }
      if (category) {
        params.push(category);
        conditions.push(`category = $${params.length}`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(clamp(limit));
      params.push(parseInt(offset) || 0);

      const { rows } = await db.query(
        `SELECT * FROM markets ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return rows;
    },

    async bets(_, { market_id, wallet_address, limit, offset = 0 }) {
      const conditions = [];
      const params = [];

      if (market_id) {
        params.push(market_id);
        conditions.push(`market_id = $${params.length}`);
      }
      if (wallet_address) {
        params.push(wallet_address);
        conditions.push(`wallet_address = $${params.length}`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(clamp(limit));
      params.push(parseInt(offset) || 0);

      const { rows } = await db.query(
        `SELECT * FROM bets ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return rows;
    },

    async betsByWallet(_, { wallet_address, limit, offset = 0 }) {
      const { rows } = await db.query(
        `SELECT * FROM bets WHERE wallet_address = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [wallet_address, clamp(limit), parseInt(offset) || 0]
      );
      return rows;
    },

    async betsByMarket(_, { market_id, limit, offset = 0 }) {
      const { rows } = await db.query(
        `SELECT * FROM bets WHERE market_id = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [market_id, clamp(limit), parseInt(offset) || 0]
      );
      return rows;
    },

    async marketStats(_, { market_id }) {
      const [poolRes, stakesRes] = await Promise.all([
        db.query(
          `SELECT COUNT(*) AS bet_count,
                  COUNT(DISTINCT wallet_address) AS unique_bettors,
                  COALESCE(SUM(amount), 0) AS total_pool
           FROM bets WHERE market_id = $1`,
          [market_id]
        ),
        db.query(
          `SELECT outcome_index,
                  COALESCE(SUM(amount), 0) AS total_stake,
                  COUNT(*) AS bet_count
           FROM bets WHERE market_id = $1
           GROUP BY outcome_index ORDER BY outcome_index`,
          [market_id]
        ),
      ]);

      const { bet_count, unique_bettors, total_pool } = poolRes.rows[0];
      return {
        market_id,
        total_pool: String(total_pool),
        bet_count: parseInt(bet_count),
        unique_bettors: parseInt(unique_bettors),
        outcome_stakes: stakesRes.rows.map((r) => ({
          outcome_index: r.outcome_index,
          total_stake: String(r.total_stake),
          bet_count: parseInt(r.bet_count),
        })),
      };
    },

    async user(_, { wallet_address }) {
      const { rows } = await db.query("SELECT * FROM users WHERE wallet_address = $1", [
        wallet_address,
      ]);
      return rows[0] ?? null;
    },

    async leaderboard(_, { type = "accuracy", limit, offset = 0 }) {
      const safeType = LEADERBOARD_TYPES.includes(type) ? type : "accuracy";
      const safeLimit = clamp(limit, 100);
      const safeOffset = parseInt(offset) || 0;

      let query;
      if (safeType === "accuracy") {
        query = `
          SELECT wallet_address,
                 COUNT(*) AS total_bets,
                 SUM(CASE WHEN paid_out THEN 1 ELSE 0 END) AS wins,
                 ROUND(SUM(CASE WHEN paid_out THEN 1 ELSE 0 END)::numeric /
                       NULLIF(COUNT(*), 0) * 100, 2) AS accuracy_pct
          FROM bets
          GROUP BY wallet_address
          HAVING COUNT(*) > 0
          ORDER BY accuracy_pct DESC, total_bets DESC
          LIMIT $1 OFFSET $2`;
      } else if (safeType === "volume") {
        query = `
          SELECT wallet_address,
                 COUNT(*) AS total_bets,
                 ROUND(SUM(amount)::numeric, 2) AS total_volume_xlm
          FROM bets
          GROUP BY wallet_address
          ORDER BY total_volume_xlm DESC, total_bets DESC
          LIMIT $1 OFFSET $2`;
      } else {
        query = `
          SELECT wallet_address,
                 COUNT(*) AS total_bets,
                 SUM(CASE WHEN paid_out THEN 1 ELSE 0 END) AS wins,
                 ROUND(SUM(CASE WHEN paid_out THEN amount ELSE 0 END)::numeric, 2) AS total_winnings_xlm
          FROM bets
          GROUP BY wallet_address
          HAVING SUM(CASE WHEN paid_out THEN 1 ELSE 0 END) > 0
          ORDER BY total_winnings_xlm DESC, wins DESC
          LIMIT $1 OFFSET $2`;
      }

      const { rows } = await db.query(query, [safeLimit, safeOffset]);
      return rows.map((row, i) => ({
        rank: safeOffset + i + 1,
        wallet_address: row.wallet_address,
        total_bets: parseInt(row.total_bets),
        wins: row.wins != null ? parseInt(row.wins) : null,
        accuracy_pct: row.accuracy_pct != null ? String(row.accuracy_pct) : null,
        total_volume_xlm: row.total_volume_xlm != null ? String(row.total_volume_xlm) : null,
        total_winnings_xlm: row.total_winnings_xlm != null ? String(row.total_winnings_xlm) : null,
      }));
    },

    async events(_, { contract_id, topic, limit, offset = 0 }) {
      const conditions = [];
      const params = [];

      if (contract_id) {
        params.push(contract_id);
        conditions.push(`contract_id = $${params.length}`);
      }
      if (topic) {
        params.push(topic);
        conditions.push(`topic = $${params.length}`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(clamp(limit));
      params.push(parseInt(offset) || 0);

      const { rows } = await db.query(
        `SELECT * FROM events ${where}
         ORDER BY ledger_time DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return rows.map((r) => ({ ...r, payload: JSON.stringify(r.payload) }));
    },

    async categories() {
      const { rows } = await db.query(
        `SELECT category AS name, COUNT(*) AS market_count
         FROM markets
         WHERE category IS NOT NULL
         GROUP BY category
         ORDER BY market_count DESC`
      );
      return rows.map((r) => ({ name: r.name, market_count: parseInt(r.market_count) }));
    },
  },

  // ── Field resolvers (use DataLoaders from context) ──────────────────────────

  Market: {
    async bets(market, _, { loaders }) {
      return loaders.betsByMarket.load(market.id);
    },
    async bet_count(market, _, { loaders }) {
      return loaders.betCount.load(market.id);
    },
  },

  Bet: {
    async market(bet, _, { loaders }) {
      return loaders.market.load(bet.market_id);
    },
  },

  User: {
    async bets(user, _, { loaders }) {
      return loaders.betsByWallet.load(user.wallet_address);
    },
  },

  // ── Subscriptions ───────────────────────────────────────────────────────────

  Subscription: {
    onBetPlaced: {
      subscribe: (_, { marketId }) => pubsub.subscribe("betPlaced", marketId),
      resolve: (payload) => payload,
    },
    onMarketResolved: {
      subscribe: (_, { marketId }) => pubsub.subscribe("marketResolved", marketId),
      resolve: (payload) => payload,
    },
    onOddsChanged: {
      subscribe: (_, { marketId }) => pubsub.subscribe("oddsChanged", marketId),
      resolve: (payload) => payload,
    },
  },
};

module.exports = resolvers;
