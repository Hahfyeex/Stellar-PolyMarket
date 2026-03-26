/**
 * indexer/mercury.js
 *
 * Mercury Indexer integration — versioned event parser.
 *
 * Subscribes the prediction market contract to Mercury and routes each
 * incoming event to a typed handler. Every handler validates the event
 * version field and upserts the relevant PostgreSQL rows.
 *
 * Supported topics (see docs/events.md for full schema):
 *   MktCreate  → markets table
 *   BetPlace   → bets + users tables
 *   MktResolv  → markets.resolved, users.total_won
 *   MktVoid    → markets.status = VOIDED
 *   MktPause   → markets.is_paused
 *   Payout     → payout_batches table
 *   LpSeed     → lp_contributions table
 *   LpClaim    → lp_claims table
 *   Dispute    → disputes table
 *   FeeColl    → fee_collections table
 */

'use strict';

const axios  = require('axios');
const db     = require('../db');
const logger = require('../utils/logger');

const MERCURY_BASE  = process.env.MERCURY_URL        || 'https://api.mercurydata.app';
const MERCURY_KEY   = process.env.MERCURY_API_KEY    || '';
const CONTRACT_ID   = process.env.CONTRACT_ADDRESS   || '';

// Minimum schema version this parser understands.
const MIN_SUPPORTED_VERSION = 1;
// Maximum schema version this parser understands.
const MAX_SUPPORTED_VERSION = 1;

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

// ── Version guard ─────────────────────────────────────────────────────────────

/**
 * Assert the event payload version is within the supported range.
 * Throws if the version is unknown so the caller can dead-letter the event.
 *
 * @param {object} payload
 * @param {string} topic
 */
function assertVersion(payload, topic) {
  const v = payload.version;
  if (typeof v !== 'number' || v < MIN_SUPPORTED_VERSION || v > MAX_SUPPORTED_VERSION) {
    throw new Error(
      `Unsupported schema version ${v} for topic "${topic}". ` +
      `Expected ${MIN_SUPPORTED_VERSION}–${MAX_SUPPORTED_VERSION}.`
    );
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

/**
 * MktCreate — market created.
 *
 * Payload (v1):
 *   version, market_id, creator, question, options_count,
 *   deadline, token, lmsr_b, creation_fee, ledger_timestamp
 */
async function handleMarketCreated(payload, meta) {
  assertVersion(payload, 'MktCreate');
  const {
    market_id, creator, question, options_count,
    deadline, token, lmsr_b, creation_fee,
  } = payload;

  await db.query(
    `INSERT INTO markets
       (id, question, options_count, deadline, contract_address,
        creator, lmsr_b, creation_fee, status, created_at)
     VALUES ($1, $2, $3, to_timestamp($4), $5, $6, $7, $8, 'ACTIVE', $9)
     ON CONFLICT (id) DO NOTHING`,
    [
      market_id, question, options_count, deadline, token,
      creator, lmsr_b, creation_fee, meta.ledger_time,
    ]
  );
}

/**
 * BetPlace — bet placed.
 *
 * Payload (v1):
 *   version, market_id, bettor, option_index, cost, shares, ledger_timestamp
 *
 * `cost` is the LMSR cost delta in stroops (what the bettor actually paid).
 * `shares` is the number of outcome shares purchased.
 */
async function handleBetPlaced(payload, meta) {
  assertVersion(payload, 'BetPlace');
  const { market_id, bettor, option_index, cost, shares } = payload;

  await db.query(
    `INSERT INTO bets
       (market_id, wallet_address, outcome_index, cost, shares, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [market_id, bettor, option_index, cost, shares, meta.ledger_time]
  );

  // Upsert user aggregate stats (cost = actual spend in stroops)
  await db.query(
    `INSERT INTO users (wallet_address, total_staked, bet_count, last_seen)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (wallet_address) DO UPDATE SET
       total_staked = users.total_staked + EXCLUDED.total_staked,
       bet_count    = users.bet_count + 1,
       last_seen    = EXCLUDED.last_seen`,
    [bettor, cost, meta.ledger_time]
  );
}

/**
 * MktResolv — market resolved.
 *
 * Payload (v1):
 *   version, market_id, winning_outcome, total_pool, fee_bps, ledger_timestamp
 */
async function handleMarketResolved(payload) {
  assertVersion(payload, 'MktResolv');
  const { market_id, winning_outcome, total_pool, fee_bps } = payload;

  await db.query(
    `UPDATE markets
     SET resolved = true,
         winning_outcome = $1,
         total_pool = $2,
         fee_bps = $3,
         status = 'RESOLVED'
     WHERE id = $4`,
    [winning_outcome, total_pool, fee_bps, market_id]
  );

  // Credit winners: total_won += their bet cost (simplified; full payout in distributor)
  await db.query(
    `UPDATE users u
     SET total_won = u.total_won + b.cost,
         win_count = u.win_count + 1
     FROM bets b
     WHERE b.wallet_address = u.wallet_address
       AND b.market_id      = $1
       AND b.outcome_index  = $2`,
    [market_id, winning_outcome]
  );
}

/**
 * MktVoid — conditional market voided.
 *
 * Payload (v1):
 *   version, market_id, condition_market_id, condition_outcome_actual, ledger_timestamp
 */
async function handleMarketVoided(payload) {
  assertVersion(payload, 'MktVoid');
  const { market_id, condition_market_id, condition_outcome_actual } = payload;

  await db.query(
    `UPDATE markets
     SET status = 'VOIDED',
         condition_market_id = $2,
         condition_outcome_actual = $3
     WHERE id = $1`,
    [market_id, condition_market_id, condition_outcome_actual]
  );
}

/**
 * MktPause — market paused or unpaused.
 *
 * Payload (v1):
 *   version, market_id, paused, ledger_timestamp
 */
async function handleMarketPaused(payload) {
  assertVersion(payload, 'MktPause');
  const { market_id, paused } = payload;

  await db.query(
    `UPDATE markets SET is_paused = $1 WHERE id = $2`,
    [paused, market_id]
  );
}

/**
 * Payout — batch payout processed.
 *
 * Payload (v1):
 *   version, market_id, recipients_paid, total_distributed, cursor, ledger_timestamp
 */
async function handlePayoutClaimed(payload, meta) {
  assertVersion(payload, 'Payout');
  const { market_id, recipients_paid, total_distributed, cursor } = payload;

  await db.query(
    `INSERT INTO payout_batches
       (market_id, recipients_paid, total_distributed, cursor, processed_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [market_id, recipients_paid, total_distributed, cursor, meta.ledger_time]
  );
}

/**
 * LpSeed — liquidity provided.
 *
 * Payload (v1):
 *   version, market_id, provider, amount, ledger_timestamp
 */
async function handleLiquidityProvided(payload, meta) {
  assertVersion(payload, 'LpSeed');
  const { market_id, provider, amount } = payload;

  await db.query(
    `INSERT INTO lp_contributions (market_id, provider, amount, contributed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (market_id, provider) DO UPDATE SET
       amount = lp_contributions.amount + EXCLUDED.amount`,
    [market_id, provider, amount, meta.ledger_time]
  );
}

/**
 * LpClaim — LP reward claimed.
 *
 * Payload (v1):
 *   version, market_id, lp, reward, ledger_timestamp
 */
async function handleLpRewardClaimed(payload, meta) {
  assertVersion(payload, 'LpClaim');
  const { market_id, lp, reward } = payload;

  await db.query(
    `INSERT INTO lp_claims (market_id, lp_address, reward, claimed_at)
     VALUES ($1, $2, $3, $4)`,
    [market_id, lp, reward, meta.ledger_time]
  );
}

/**
 * Dispute — dispute raised.
 *
 * Payload (v1):
 *   version, market_id, disputer, bond_amount, ledger_timestamp
 */
async function handleDisputeRaised(payload, meta) {
  assertVersion(payload, 'Dispute');
  const { market_id, disputer, bond_amount } = payload;

  await db.query(
    `INSERT INTO disputes (market_id, disputer, bond_amount, raised_at, active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (market_id) DO UPDATE SET
       disputer    = EXCLUDED.disputer,
       bond_amount = EXCLUDED.bond_amount,
       raised_at   = EXCLUDED.raised_at,
       active      = true`,
    [market_id, disputer, bond_amount, meta.ledger_time]
  );

  await db.query(
    `UPDATE markets SET status = 'DISPUTED' WHERE id = $1`,
    [market_id]
  );
}

/**
 * FeeColl — creation fee collected.
 *
 * Payload (v1):
 *   version, market_id, payer, fee_destination, amount, ledger_timestamp
 */
async function handleFeeCollected(payload, meta) {
  assertVersion(payload, 'FeeColl');
  const { market_id, payer, fee_destination, amount } = payload;

  await db.query(
    `INSERT INTO fee_collections
       (market_id, payer, fee_destination, amount, collected_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [market_id, payer, fee_destination, amount, meta.ledger_time]
  );
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Process a single Mercury event object.
 * Called by the webhook handler or the polling loop.
 *
 * @param {object} event - Mercury event envelope
 * @param {string} event.topic        - Event topic symbol (e.g. "MktCreate")
 * @param {object} event.payload      - Deserialised XDR data struct
 * @param {string} event.tx_hash
 * @param {number} event.event_index
 * @param {number} event.ledger_seq
 * @param {string} event.ledger_time  - ISO timestamp
 */
async function processEvent(event) {
  const { topic, payload, tx_hash, event_index, ledger_seq, ledger_time } = event;
  const meta = { ledger_seq, ledger_time };

  // Persist raw event for audit / replay before any handler runs
  await db.query(
    `INSERT INTO events
       (contract_id, topic, payload, ledger_seq, ledger_time, tx_hash, event_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tx_hash, event_index) DO NOTHING`,
    [CONTRACT_ID, topic, JSON.stringify(payload), ledger_seq, ledger_time, tx_hash, event_index]
  );

  try {
    switch (topic) {
      case 'MktCreate': return await handleMarketCreated(payload, meta);
      case 'BetPlace':  return await handleBetPlaced(payload, meta);
      case 'MktResolv': return await handleMarketResolved(payload);
      case 'MktVoid':   return await handleMarketVoided(payload);
      case 'MktPause':  return await handleMarketPaused(payload);
      case 'Payout':    return await handlePayoutClaimed(payload, meta);
      case 'LpSeed':    return await handleLiquidityProvided(payload, meta);
      case 'LpClaim':   return await handleLpRewardClaimed(payload, meta);
      case 'Dispute':   return await handleDisputeRaised(payload, meta);
      case 'FeeColl':   return await handleFeeCollected(payload, meta);
      default:
        logger.warn({ topic }, 'Unknown event topic — stored but not processed');
    }
  } catch (err) {
    logger.error({ topic, tx_hash, err: err.message }, 'Event handler failed');
    throw err; // re-throw so the caller can dead-letter or retry
  }
}

module.exports = {
  subscribe,
  processEvent,
  // Named exports for unit testing
  handleMarketCreated,
  handleBetPlaced,
  handleMarketResolved,
  handleMarketVoided,
  handleMarketPaused,
  handlePayoutClaimed,
  handleLiquidityProvided,
  handleLpRewardClaimed,
  handleDisputeRaised,
  handleFeeCollected,
};
