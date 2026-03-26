/**
 * graphql/resolvers.js
 *
 * GraphQL resolvers backed by PostgreSQL.
 * All queries use parameterised statements to prevent SQL injection.
 * Default limit is 50 rows; max is 200.
 */

const db = require('../db');

const clamp = (n, max = 200) => Math.min(Math.max(parseInt(n) || 50, 1), max);

const resolvers = {
  Query: {
    // ── market ──────────────────────────────────────────────────────────────

    async market(_, { id }) {
      const { rows } = await db.query('SELECT * FROM markets WHERE id = $1', [id]);
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

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(clamp(limit));
      params.push(parseInt(offset) || 0);

      const { rows } = await db.query(
        `SELECT * FROM markets ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return rows;
    },

    // ── bets ─────────────────────────────────────────────────────────────────

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

    // ── market stats ──────────────────────────────────────────────────────────

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

    // ── user ──────────────────────────────────────────────────────────────────

    async user(_, { wallet_address }) {
      const { rows } = await db.query(
        'SELECT * FROM users WHERE wallet_address = $1',
        [wallet_address]
      );
      return rows[0] ?? null;
    },

    // ── events ────────────────────────────────────────────────────────────────

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

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(clamp(limit));
      params.push(parseInt(offset) || 0);

      const { rows } = await db.query(
        `SELECT * FROM events ${where}
         ORDER BY ledger_time DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      // Serialize payload back to string for GraphQL
      return rows.map((r) => ({ ...r, payload: JSON.stringify(r.payload) }));
    },
  },

  // ── field resolvers ─────────────────────────────────────────────────────────

  Market: {
    async bets(market) {
      const { rows } = await db.query(
        'SELECT * FROM bets WHERE market_id = $1 ORDER BY created_at DESC LIMIT 50',
        [market.id]
      );
      return rows;
    },
    async bet_count(market) {
      const { rows } = await db.query(
        'SELECT COUNT(*) FROM bets WHERE market_id = $1',
        [market.id]
      );
      return parseInt(rows[0].count);
    },
  },

  Bet: {
    async market(bet) {
      const { rows } = await db.query('SELECT * FROM markets WHERE id = $1', [bet.market_id]);
      return rows[0] ?? null;
    },
  },

  User: {
    async bets(user) {
      const { rows } = await db.query(
        'SELECT * FROM bets WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT 50',
        [user.wallet_address]
      );
      return rows;
    },
  },
};

module.exports = resolvers;
