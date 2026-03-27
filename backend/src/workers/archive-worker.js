/**
 * workers/archive-worker.js
 *
 * Nightly cron job that moves markets resolved more than 7 days ago
 * from the primary `markets` table into the `archived_markets` table.
 *
 * Schedule: every day at 02:00 UTC
 */

const cron = require("node-cron");
const db = require("../db");
const logger = require("../utils/logger");

/**
 * Move resolved markets older than 7 days to the archive table.
 * Exported for direct invocation in tests.
 */
async function archiveResolvedMarkets() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Insert into archive (ignore conflicts in case of re-runs)
    const inserted = await client.query(
      `INSERT INTO archived_markets
         SELECT *, NOW() AS archived_at
         FROM markets
         WHERE resolved = true
           AND status = 'RESOLVED'
           AND end_date <= NOW() - INTERVAL '7 days'
       ON CONFLICT (id) DO NOTHING
       RETURNING id`
    );

    const ids = inserted.rows.map((r) => r.id);

    if (ids.length > 0) {
      // Remove from primary table
      await client.query(`DELETE FROM markets WHERE id = ANY($1::int[])`, [ids]);
    }

    await client.query("COMMIT");

    logger.info({ archived: ids.length }, "Market archival complete");
    return ids;
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err: err.message }, "Market archival failed");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Start the nightly archival cron.
 * Runs at 02:00 UTC every day.
 */
function start() {
  cron.schedule("0 2 * * *", async () => {
    logger.info("Running nightly market archival");
    await archiveResolvedMarkets();
  });
  logger.info("Archive cron started (daily at 02:00 UTC)");
}

module.exports = { start, archiveResolvedMarkets };
