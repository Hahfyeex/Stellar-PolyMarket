/**
 * indexer/mercury.js
 *
 * Mercury Indexer integration.
 *
 * Mercury (https://mercurydata.app) is a Stellar/Soroban event indexer that
 * subscribes to contract events and delivers them via webhook or polling.
 *
 * This module:
 *   1. Subscribes the prediction market contract to Mercury on startup
 *   2. Exposes a processEvent(event) handler that parses each event and
 *      upserts the relevant rows into PostgreSQL
 *
 * Supported event topics (matching Soroban contract emit calls):
 *   - "Bet"             → upsert bets + users tables
 *   - "MarketCreated"   → upsert markets table
 *   - "MarketResolved"  → update markets.resolved
 */

const axios = require('axios');
const db = require('../db');
const logger = require('../utils/logger');

const MERCURY_BASE = process.env.MERCURY_URL || 'https://api.mercurydata.app';
const MERCURY_KEY  = process.env.MERCURY_API_KEY || '';
const CONTRACT_ID  = process.env.CONTRACT_ADDRESS || '';

// ── Subscription ──────────────────────────────────────────────────────────────

/**
 * Register the prediction market contract with Mercury so it starts
 * delivering events. Safe to call on every startup — Mercury deduplicates.
 */
async function subscribe() {
  if (!CONTRACT_ID || !MERCURY_KEY) {
    logger.warn('Mercury subscription skipped: CONTRACT_ADDRESS or MERCURY_API_KEY not set');
    return;
  }
  try {
    await axios.post(
      `${MERCURY_BASE}/event/subscribe`,
      { contract_id: CONTRACT_ID },
      { headers: { Authorization: `Bearer ${MERCURY_KEY}` } }
    );
    logger.info({ contract_id: CONTRACT_ID }, 'Mercury subscription registered');
  } catch (err) {
    logger.error({ err: err.message }, 'Mercury subscription failed');
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * Handle a "Bet" event.
 * Payload: { market_id, bettor, outcome_index, amount }
 *
 * Upserts into bets table and updates per-wallet user stats.
 */
async function handleBet(payload, meta) {
  const { market_id, bettor, outcome_index, amount } = payload;

  // Insert bet row (ignore duplicate tx+index via ON CONFLICT on events table)
  await db.query(
    `INSERT INTO bets (market_id, wallet_address, outcome_index, amount, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [market_id, bettor, outcome_index, amount, meta.ledger_time]
  );

  // Upsert user aggregate stats
  await db.query(
    `INSERT INTO users (wallet_address, total_staked, bet_count, last_seen)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (wallet_address) DO UPDATE SET
       total_staked = users.total_staked + EXCLUDED.total_staked,
       bet_count    = users.bet_count + 1,
       last_seen    = EXCLUDED.last_seen`,
    [bettor, amount, meta.ledger_time]
  );
}

/**
 * Handle a "MarketCreated" event.
 * Payload: { id, question, outcomes, end_date, token, category }
 */
async function handleMarketCreated(payload, meta) {
  const { id, question, outcomes, end_date, token, category = 'general' } = payload;

  await db.query(
    `INSERT INTO markets (id, question, outcomes, end_date, contract_address, category, created_at)
     VALUES ($1, $2, $3, to_timestamp($4), $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [id, question, outcomes, end_date, token, category, meta.ledger_time]
  );
}

/**
 * Handle a "MarketResolved" event.
 * Payload: { market_id, winning_outcome }
 *
 * Also credits total_won for all winning bettors.
 */
async function handleMarketResolved(payload) {
  const { market_id, winning_outcome } = payload;

  // Mark market resolved
  await db.query(
    `UPDATE markets SET resolved = true, winning_outcome = $1, status = 'RESOLVED'
     WHERE id = $2`,
    [winning_outcome, market_id]
  );

  // Credit winners: total_won += their bet amount (simplified — full payout calc in distributor)
  await db.query(
    `UPDATE users u
     SET total_won = u.total_won + b.amount,
         win_count = u.win_count + 1
     FROM bets b
     WHERE b.wallet_address = u.wallet_address
       AND b.market_id = $1
       AND b.outcome_index = $2`,
    [market_id, winning_outcome]
  );
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Process a single Mercury event object.
 * Called by the webhook handler or the polling loop.
 *
 * @param {object} event - Mercury event envelope
 * @param {string} event.topic
 * @param {object} event.payload
 * @param {string} event.tx_hash
 * @param {number} event.event_index
 * @param {number} event.ledger_seq
 * @param {string} event.ledger_time  ISO timestamp
 */
async function processEvent(event) {
  const { topic, payload, tx_hash, event_index, ledger_seq, ledger_time } = event;
  const meta = { ledger_seq, ledger_time };

  // Persist raw event for audit / replay
  await db.query(
    `INSERT INTO events (contract_id, topic, payload, ledger_seq, ledger_time, tx_hash, event_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tx_hash, event_index) DO NOTHING`,
    [CONTRACT_ID, topic, JSON.stringify(payload), ledger_seq, ledger_time, tx_hash, event_index]
  );

  // Route to the appropriate handler
  switch (topic) {
    case 'Bet':             return handleBet(payload, meta);
    case 'MarketCreated':   return handleMarketCreated(payload, meta);
    case 'MarketResolved':  return handleMarketResolved(payload);
    default:
      logger.warn({ topic }, 'Unknown event topic — stored but not processed');
  }
}

module.exports = { subscribe, processEvent, handleBet, handleMarketCreated, handleMarketResolved };
