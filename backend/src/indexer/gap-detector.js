/**
 * indexer/gap-detector.js
 *
 * Self-healing mechanism for the Indexer that detects missing ledgers
 * due to network downtime or RPC failure and automatically back-fills them.
 *
 * On startup, compares Max(DB_Ledger) with Latest_Stellar_Ledger.
 * If a gap exists, spawns a worker to fetch and process the missing range.
 */

'use strict';

const db = require('../db');
const logger = require('../utils/logger');
const { SorobanRpc } = require('@stellar/stellar-sdk');
const { processEvent } = require('./mercury');

const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const CONTRACT_ID = process.env.CONTRACT_ADDRESS || '';

// Configuration for gap filling strategies
const GAP_FILL_CONFIG = {
  // Maximum number of ledgers to fetch in a single batch
  BATCH_SIZE: parseInt(process.env.GAP_FILL_BATCH_SIZE) || 10,
  // Delay between batches to avoid rate limiting (ms)
  BATCH_DELAY: parseInt(process.env.GAP_FILL_BATCH_DELAY) || 1000,
  // Maximum gap size to attempt auto-recovery (larger gaps require manual intervention)
  MAX_AUTO_RECOVERY_GAP: parseInt(process.env.MAX_AUTO_RECOVERY_GAP) || 1000,
  // Strategy: 'serial' or 'batch'
  STRATEGY: process.env.GAP_FILL_STRATEGY || 'batch'
};

// Initialize Soroban RPC client
const rpcServer = new SorobanRpc.Server(RPC_URL);

/**
 * Get the latest ledger sequence from Stellar network
 */
async function getLatestStellarLedger() {
  try {
    const latestLedger = await rpcServer.getLatestLedger();
    return latestLedger.sequence;
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to fetch latest ledger from Stellar');
    throw err;
  }
}

/**
 * Get the maximum ledger sequence stored in our database
 */
async function getMaxDbLedger() {
  try {
    const result = await db.query(
      'SELECT MAX(ledger_seq) as max_ledger FROM events WHERE contract_id = $1',
      [CONTRACT_ID]
    );
    
    // If no events exist, return 0 to indicate we need to start from scratch
    return result.rows[0].max_ledger || 0;
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to get max ledger from database');
    throw err;
  }
}

/**
 * Detect if there's a gap between our database and the Stellar network
 */
async function detectGap() {
  try {
    const [dbLedger, stellarLedger] = await Promise.all([
      getMaxDbLedger(),
      getLatestStellarLedger()
    ]);

    const gap = stellarLedger - dbLedger;
    
    logger.info({
      db_max_ledger: dbLedger,
      stellar_latest_ledger: stellarLedger,
      gap_size: gap
    }, 'Gap detection completed');

    return {
      dbLedger,
      stellarLedger,
      gap,
      hasGap: gap > 0
    };
  } catch (err) {
    logger.error({ err: err.message }, 'Gap detection failed');
    throw err;
  }
}

/**
 * Fetch events from a specific ledger range
 */
async function fetchEventsFromLedgers(startLedger, endLedger) {
  try {
    logger.info({ 
      start_ledger: startLedger, 
      end_ledger: endLedger,
      contract_id: CONTRACT_ID
    }, 'Fetching events from ledger range');

    const events = [];
    
    // Fetch events for each ledger in the range
    for (let ledger = startLedger; ledger <= endLedger; ledger++) {
      try {
        const ledgerResult = await rpcServer.getLedger({
          sequence: ledger,
          includeEvents: true
        });

        if (ledgerResult.events && ledgerResult.events.length > 0) {
          // Filter events for our contract
          const contractEvents = ledgerResult.events
            .filter(event => event.contractId === CONTRACT_ID)
            .map(event => ({
              topic: event.topic.join('::'),
              payload: event.body,
              tx_hash: event.transactionHash || `ledger-${ledger}`,
              event_index: event.id || 0,
              ledger_seq: ledger,
              ledger_time: ledgerResult.closingTime
            }));

          events.push(...contractEvents);
        }

        // Add small delay to avoid rate limiting
        if (GAP_FILL_CONFIG.STRATEGY === 'serial') {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (ledgerErr) {
        logger.warn({ 
          ledger, 
          err: ledgerErr.message 
        }, 'Failed to fetch events from ledger, skipping');
        // Continue with next ledger instead of failing the entire batch
      }
    }

    logger.info({
      start_ledger: startLedger,
      end_ledger: endLedger,
      events_found: events.length
    }, 'Successfully fetched events from range');

    return events;
  } catch (err) {
    logger.error({ 
      err: err.message,
      start_ledger: startLedger,
      end_ledger: endLedger
    }, 'Failed to fetch events from ledger range');
    throw err;
  }
}

/**
 * Process a batch of events (serial or batch strategy)
 */
async function processEventBatch(events) {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  logger.info({ 
    event_count: events.length,
    strategy: GAP_FILL_CONFIG.STRATEGY
  }, 'Starting event batch processing');

  if (GAP_FILL_CONFIG.STRATEGY === 'serial') {
    // Process events one by one
    for (const event of events) {
      try {
        await processEvent(event);
        processed++;
      } catch (err) {
        logger.error({ 
          err: err.message,
          event: { 
            topic: event.topic, 
            ledger_seq: event.ledger_seq,
            tx_hash: event.tx_hash 
          }
        }, 'Failed to process event during gap fill');
        failed++;
      }
    }
  } else {
    // Process events in parallel (batch strategy)
    const promises = events.map(async (event) => {
      try {
        await processEvent(event);
        return { success: true };
      } catch (err) {
        logger.error({ 
          err: err.message,
          event: { 
            topic: event.topic, 
            ledger_seq: event.ledger_seq,
            tx_hash: event.tx_hash 
          }
        }, 'Failed to process event during gap fill');
        return { success: false, error: err.message };
      }
    });

    const results = await Promise.allSettled(promises);
    processed = results.filter(r => r.value?.success).length;
    failed = results.length - processed;
  }

  const duration = Date.now() - startTime;
  logger.info({
    event_count: events.length,
    processed,
    failed,
    duration_ms: duration,
    strategy: GAP_FILL_CONFIG.STRATEGY
  }, 'Event batch processing completed');

  return { processed, failed };
}

/**
 * Back-fill missing ledgers using the configured strategy
 */
async function backFillMissingLedgers(startLedger, endLedger) {
  const startTime = Date.now();
  let totalProcessed = 0;
  let totalFailed = 0;

  logger.info({
    start_ledger: startLedger,
    end_ledger: endLedger,
    strategy: GAP_FILL_CONFIG.STRATEGY,
    batch_size: GAP_FILL_CONFIG.BATCH_SIZE
  }, '[RECOVERY] Starting back-fill of missing ledgers');

  try {
    if (GAP_FILL_CONFIG.STRATEGY === 'serial') {
      // Serial strategy: process one ledger at a time
      for (let ledger = startLedger; ledger <= endLedger; ledger++) {
        const events = await fetchEventsFromLedgers(ledger, ledger);
        
        if (events.length > 0) {
          const { processed, failed } = await processEventBatch(events);
          totalProcessed += processed;
          totalFailed += failed;
        }

        // Small delay between ledgers
        await new Promise(resolve => setTimeout(resolve, GAP_FILL_CONFIG.BATCH_DELAY));
      }
    } else {
      // Batch strategy: process multiple ledgers at once
      for (let batchStart = startLedger; batchStart <= endLedger; batchStart += GAP_FILL_CONFIG.BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + GAP_FILL_CONFIG.BATCH_SIZE - 1, endLedger);
        
        const events = await fetchEventsFromLedgers(batchStart, batchEnd);
        
        if (events.length > 0) {
          const { processed, failed } = await processEventBatch(events);
          totalProcessed += processed;
          totalFailed += failed;
        }

        // Delay between batches
        if (batchEnd < endLedger) {
          await new Promise(resolve => setTimeout(resolve, GAP_FILL_CONFIG.BATCH_DELAY));
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info({
      start_ledger: startLedger,
      end_ledger: endLedger,
      total_processed: totalProcessed,
      total_failed: totalFailed,
      duration_ms: duration,
      strategy: GAP_FILL_CONFIG.STRATEGY
    }, '[RECOVERY] Back-fill completed successfully');

    return { totalProcessed, totalFailed, duration };
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error({
      err: err.message,
      start_ledger: startLedger,
      end_ledger: endLedger,
      total_processed: totalProcessed,
      total_failed: totalFailed,
      duration_ms: duration
    }, '[RECOVERY] Back-fill failed');
    throw err;
  }
}

/**
 * Main self-healing function that detects and fills gaps
 */
async function runSelfHealing() {
  try {
    logger.info('Starting indexer self-healing process');

    const gapInfo = await detectGap();
    
    if (!gapInfo.hasGap) {
      logger.info('No ledger gap detected - indexer is up to date');
      return { success: true, message: 'No gap detected' };
    }

    if (gapInfo.gap > GAP_FILL_CONFIG.MAX_AUTO_RECOVERY_GAP) {
      logger.warn({
        gap_size: gapInfo.gap,
        max_auto_recovery: GAP_FILL_CONFIG.MAX_AUTO_RECOVERY_GAP
      }, 'Gap too large for automatic recovery - manual intervention required');
      
      return { 
        success: false, 
        message: 'Gap too large for auto-recovery',
        gapSize: gapInfo.gap,
        requiresManualIntervention: true
      };
    }

    logger.info({
      gap_size: gapInfo.gap,
      start_ledger: gapInfo.dbLedger + 1,
      end_ledger: gapInfo.stellarLedger
    }, `[RECOVERY] Found ${gapInfo.gap} missing ledgers. Commencing back-fill...`);

    const result = await backFillMissingLedgers(
      gapInfo.dbLedger + 1,
      gapInfo.stellarLedger
    );

    logger.info({
      gap_filled: gapInfo.gap,
      events_processed: result.totalProcessed,
      events_failed: result.totalFailed,
      duration_ms: result.duration
    }, '[RECOVERY] Self-healing completed successfully');

    return { 
      success: true, 
      message: 'Gap filled successfully',
      gapSize: gapInfo.gap,
      ...result
    };

  } catch (err) {
    logger.error({ err: err.message }, 'Self-healing process failed');
    throw err;
  }
}

/**
 * Initialize and run self-healing on startup
 */
async function initializeSelfHealing() {
  if (!CONTRACT_ID) {
    logger.warn('CONTRACT_ADDRESS not set - skipping self-healing');
    return;
  }

  try {
    await runSelfHealing();
  } catch (err) {
    logger.error({ err: err.message }, 'Self-healing initialization failed');
    // Don't throw - allow the application to start even if self-healing fails
  }
}

module.exports = {
  runSelfHealing,
  initializeSelfHealing,
  detectGap,
  getLatestStellarLedger,
  getMaxDbLedger,
  backFillMissingLedgers,
  GAP_FILL_CONFIG
};
