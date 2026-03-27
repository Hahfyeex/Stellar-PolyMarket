'use strict';

/**
 * oracle/sports/index.js — Sports API → On-chain Resolution Pipeline
 *
 * Polls the backend for unresolved sports markets, fetches results from
 * API-Football, and submits resolve_market() to the Soroban contract.
 *
 * Retry policy: 3 attempts with exponential backoff (1s → 2s → 4s).
 * After 3 failures the market is dead-lettered via the backend API.
 *
 * All resolution attempts and outcomes are logged to the persistent store
 * via POST /api/oracle/log. The oracle keypair is NEVER logged.
 *
 * Environment variables (see .env.example):
 *   API_URL           — backend base URL
 *   SPORTS_API_KEY    — API-Football key
 *   ORACLE_SECRET_KEY — Stellar oracle keypair secret (never logged)
 *   STELLAR_RPC_URL   — Soroban RPC endpoint
 *   STELLAR_NETWORK   — testnet | mainnet
 *   CONTRACT_ID       — deployed contract address
 *   POLL_INTERVAL_MS  — polling interval in ms (default: 60000)
 */

require('dotenv').config();

const axios              = require('axios');
const { didTeamWin }     = require('./sportsApi');
const { resolveMarketOnChain } = require('./stellarResolver');
const logger             = require('../../backend/src/utils/logger');

const API_URL          = process.env.API_URL         || 'http://localhost:4000';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);
const MAX_ATTEMPTS     = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Exponential backoff: 1s, 2s, 4s for attempts 0, 1, 2. */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse the team name from a market question.
 * Supports: "Will <Team> win ..." and "Does <Team> beat ..."
 *
 * @param {string} question
 * @returns {string|null}
 */
function parseTeamName(question) {
  const m = question.match(/(?:Will|Does)\s+(.+?)\s+(?:win|beat)/i);
  return m ? m[1].trim() : null;
}

/**
 * Determine the winning outcome index for a sports market.
 * outcome 0 = first option (typically "Yes" / home team wins)
 * outcome 1 = second option (typically "No" / away team wins)
 *
 * @param {object} market — DB/API market row
 * @returns {Promise<number>} 0 or 1
 */
async function fetchSportsOutcome(market) {
  const teamName = parseTeamName(market.question);
  if (!teamName) {
    throw new Error(`Cannot parse team name from question: "${market.question}"`);
  }
  const { won } = await didTeamWin(teamName);
  return won ? 0 : 1;
}

// ── Persistent logging ────────────────────────────────────────────────────────

/**
 * Persist a resolution attempt record to the backend store.
 * Never includes the oracle keypair or any secret material.
 *
 * @param {object} entry
 */
async function logResolutionAttempt(entry) {
  try {
    await axios.post(`${API_URL}/api/oracle/log`, entry, { timeout: 5000 });
  } catch (err) {
    // Non-fatal — log locally but don't block resolution
    logger.warn({ err: err.message }, 'Failed to persist oracle log entry');
  }
}

// ── Core resolution logic ─────────────────────────────────────────────────────

/**
 * Attempt to resolve a single market with retry + exponential backoff.
 * Logs every attempt and the final outcome.
 *
 * @param {object} market
 * @returns {Promise<{txHash: string, winningOutcome: number}>}
 * @throws after MAX_ATTEMPTS failures
 */
async function resolveMarketWithRetry(market) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptStart = Date.now();
    try {
      logger.info({ marketId: market.id, attempt }, 'Sports oracle: resolution attempt');

      const winningOutcome = await fetchSportsOutcome(market);
      const txHash         = await resolveMarketOnChain(market.id, winningOutcome);
      const durationMs     = Date.now() - attemptStart;

      await logResolutionAttempt({
        market_id:       market.id,
        attempt,
        status:          'success',
        winning_outcome: winningOutcome,
        tx_hash:         txHash,
        duration_ms:     durationMs,
        resolved_at:     new Date().toISOString(),
      });

      logger.info({ marketId: market.id, winningOutcome, txHash }, 'Market resolved on-chain');
      return { txHash, winningOutcome };

    } catch (err) {
      lastError = err;
      const durationMs = Date.now() - attemptStart;

      // IMPORTANT: never log err.message if it could contain key material.
      // Our loadKeypair() never puts the secret in the message, but we
      // sanitise here as a defence-in-depth measure.
      const safeMessage = sanitizeErrorMessage(err.message);

      logger.warn(
        { marketId: market.id, attempt, durationMs, err: safeMessage },
        'Sports oracle: attempt failed'
      );

      await logResolutionAttempt({
        market_id:   market.id,
        attempt,
        status:      'failed',
        error:       safeMessage,
        duration_ms: durationMs,
        resolved_at: new Date().toISOString(),
      });

      if (attempt < MAX_ATTEMPTS) {
        const backoffMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        logger.info({ marketId: market.id, backoffMs }, 'Backing off before retry');
        await delay(backoffMs);
      }
    }
  }

  throw lastError;
}

/**
 * Strip any string that looks like a Stellar secret key (S + 55 base32 chars)
 * from an error message before logging.
 *
 * @param {string} msg
 * @returns {string}
 */
function sanitizeErrorMessage(msg) {
  if (typeof msg !== 'string') return String(msg);
  // Stellar secret keys: S followed by 55 uppercase base32 characters
  return msg.replace(/S[A-Z2-7]{55}/g, '[REDACTED_SECRET]');
}

// ── Dead-letter ───────────────────────────────────────────────────────────────

/**
 * Send a market to the dead-letter queue after all retries are exhausted.
 *
 * @param {object} market
 * @param {Error}  error
 */
async function deadLetter(market, error) {
  const safeMessage = sanitizeErrorMessage(error.message);
  try {
    await axios.post(`${API_URL}/api/oracle/dead-letter`, {
      market_id: market.id,
      oracle_type: 'sports',
      error: safeMessage,
      attempts: MAX_ATTEMPTS,
      failed_at: new Date().toISOString(),
    }, { timeout: 5000 });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to write to dead-letter queue');
  }
  logger.error(
    { marketId: market.id, error: safeMessage },
    'Market dead-lettered after max retries'
  );
}

// ── Polling loop ──────────────────────────────────────────────────────────────

/**
 * Fetch all unresolved, expired sports markets from the backend.
 *
 * @returns {Promise<object[]>}
 */
async function fetchPendingMarkets() {
  const { data } = await axios.get(`${API_URL}/api/markets`, {
    params: { category: 'sports', resolved: false },
    timeout: 8000,
  });
  const now = Date.now();
  return (data.markets || []).filter(
    (m) => !m.resolved && new Date(m.end_date).getTime() <= now
  );
}

/**
 * One poll cycle: fetch pending markets and attempt resolution for each.
 * Exported for direct invocation in tests and admin triggers.
 */
async function runCycle() {
  logger.info('Sports oracle: starting poll cycle');
  let markets;
  try {
    markets = await fetchPendingMarkets();
  } catch (err) {
    logger.error({ err: err.message }, 'Sports oracle: failed to fetch pending markets');
    return;
  }

  logger.info({ count: markets.length }, 'Sports oracle: markets pending resolution');

  for (const market of markets) {
    try {
      await resolveMarketWithRetry(market);
    } catch (err) {
      await deadLetter(market, err);
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

/* istanbul ignore next */
if (require.main === module) {
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, 'Sports oracle service starting');
  runCycle();
  setInterval(runCycle, POLL_INTERVAL_MS);
}

module.exports = {
  runCycle,
  resolveMarketWithRetry,
  fetchSportsOutcome,
  parseTeamName,
  deadLetter,
  sanitizeErrorMessage,
  delay,
};
