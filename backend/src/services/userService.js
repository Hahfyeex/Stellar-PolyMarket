const db = require("../db");
const logger = require("../utils/logger");

/**
 * Service to handle user-related operations.
 */
class UserService {
  /**
   * Scrubs a user's PII while maintaining their wallet_address for relational integrity.
   * @param {string} walletAddress - The wallet address of the user to scrub.
   * @returns {Promise<object>} - The scrubbed user record and audit log ID.
   */
  async scrubUser(walletAddress) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // 1. Check if user exists
      const userRes = await client.query("SELECT * FROM users WHERE wallet_address = $1", [walletAddress]);
      if (userRes.rows.length === 0) {
        throw new Error("User not found");
      }

      // 2. Scrub PII
      // social_handles is JSONB, so we'll replace the entire object or specific keys if they exist.
      // For simplicity and completeness as per guidelines, we replace with [DELETED].
      const scrubQuery = `
        UPDATE users
        SET email = '[DELETED]',
            social_handles = '{"twitter": "[DELETED]", "discord": "[DELETED]", "telegram": "[DELETED]"}'::jsonb,
            profile_bio = '[DELETED]'
        WHERE wallet_address = $1
        RETURNING *;
      `;
      const scrubbedUser = await client.query(scrubQuery, [walletAddress]);

      // 3. Create Audit Log
      const auditQuery = `
        INSERT INTO audit_logs (action, wallet_address, details)
        VALUES ($1, $2, $3)
        RETURNING id;
      `;
      const auditRes = await client.query(auditQuery, [
        "USER_DELETION_REQUEST",
        walletAddress,
        JSON.stringify({ timestamp: new Date().toISOString(), reason: "GDPR Deletion Request" }),
      ]);

      await client.query("COMMIT");
      
      logger.info({ wallet_address: walletAddress, audit_log_id: auditRes.rows[0].id }, "User PII successfully scrubbed");
      
      return {
        user: scrubbedUser.rows[0],
        auditLogId: auditRes.rows[0].id,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error({ err, wallet_address: walletAddress }, "Failed to scrub user PII");
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new UserService();
