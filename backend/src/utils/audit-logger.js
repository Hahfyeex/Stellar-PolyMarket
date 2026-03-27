const axios = require("axios");

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

/**
 * AuditLogger — uploads immutable audit log entries to IPFS via Pinata.
 * Non-blocking: IPFS failures are logged but never break the caller.
 */
class AuditLogger {
  /**
   * @param {object} httpClient - axios-compatible HTTP client (injectable for testing)
   */
  constructor(httpClient = axios) {
    this.httpClient = httpClient;
  }

  /**
   * Create an audit log entry and pin it to IPFS.
   * @param {object} entry - { actor, action, details, timestamp }
   * @returns {Promise<string|null>} IPFS CID on success, null on failure
   */
  async log({ actor, action, details, timestamp }) {
    const payload = {
      actor,
      action,
      details,
      timestamp: timestamp || new Date().toISOString(),
    };

    try {
      const res = await this.httpClient.post(
        PINATA_API_URL,
        {
          pinataContent: payload,
          pinataMetadata: { name: `audit-${action}-${Date.now()}` },
        },
        {
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_KEY,
          },
        }
      );

      const cid = res.data.IpfsHash;
      console.log(`[AuditLogger] Pinned to IPFS: ${cid}`);
      return cid;
    } catch (err) {
      // Non-blocking — log the error but don't throw
      console.warn(`[AuditLogger] IPFS pin failed: ${err.message}`);
      return null;
    }
  }
}

module.exports = { AuditLogger };
