"use strict";
/**
 * Governance Routes — Stellar Council
 *
 * POST /api/governance/council/check      — verify council membership
 * GET  /api/governance/disputes           — list all disputes
 * POST /api/governance/disputes/:id/vote  — cast a council vote
 */

const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");

// ---------------------------------------------------------------------------
// Council membership check
// In production this would query an on-chain allowlist or a DB table.
// For now it checks a COUNCIL_MEMBERS env var (comma-separated wallet addresses).
// ---------------------------------------------------------------------------
const COUNCIL_MEMBERS = new Set(
  (process.env.COUNCIL_MEMBERS || "").split(",").map((s) => s.trim()).filter(Boolean)
);

/**
 * POST /api/governance/council/check
 * Body: { walletAddress: string }
 * Returns: { isMember: boolean }
 */
router.post("/council/check", (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }
  const isMember = COUNCIL_MEMBERS.has(walletAddress);
  logger.debug({ walletAddress, isMember }, "Council membership check");
  return res.json({ isMember });
});

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

/**
 * GET /api/governance/disputes
 * Returns all disputes with vote tallies.
 */
router.get("/disputes", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.*, 
        COUNT(CASE WHEN v.vote = 'yes' THEN 1 END)::int AS votes_yes,
        COUNT(CASE WHEN v.vote = 'no'  THEN 1 END)::int AS votes_no
       FROM governance_disputes d
       LEFT JOIN governance_votes v ON v.dispute_id = d.id
       GROUP BY d.id
       ORDER BY d.created_at DESC`
    );
    res.json({ disputes: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to fetch disputes");
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/governance/disputes/:id/vote
 * Body: { walletAddress: string, vote: "yes" | "no" }
 *
 * Rules:
 *   - Wallet must be a council member
 *   - One vote per wallet per dispute
 *   - Dispute must be active and within 24h window
 */
router.post("/disputes/:id/vote", async (req, res) => {
  const disputeId = parseInt(req.params.id, 10);
  const { walletAddress, vote } = req.body;

  if (!walletAddress || !["yes", "no"].includes(vote)) {
    return res.status(400).json({ error: "walletAddress and vote ('yes'|'no') are required" });
  }

  // Council membership gate
  if (!COUNCIL_MEMBERS.has(walletAddress)) {
    logger.warn({ walletAddress, disputeId }, "Non-council member attempted to vote");
    return res.status(403).json({ error: "Not a council member" });
  }

  try {
    // Check dispute exists and is active
    const disputeResult = await db.query(
      "SELECT * FROM governance_disputes WHERE id = $1",
      [disputeId]
    );
    if (!disputeResult.rows.length) {
      return res.status(404).json({ error: "Dispute not found" });
    }
    const dispute = disputeResult.rows[0];
    if (dispute.status !== "active") {
      return res.status(409).json({ error: "Dispute is no longer active" });
    }
    if (new Date(dispute.expires_at) < new Date()) {
      return res.status(409).json({ error: "Voting window has expired" });
    }

    // Duplicate vote check
    const existing = await db.query(
      "SELECT id FROM governance_votes WHERE dispute_id = $1 AND wallet_address = $2",
      [disputeId, walletAddress]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: "Already voted on this dispute" });
    }

    // Record vote
    await db.query(
      "INSERT INTO governance_votes (dispute_id, wallet_address, vote, created_at) VALUES ($1, $2, $3, NOW())",
      [disputeId, walletAddress, vote]
    );

    logger.info({ disputeId, walletAddress, vote }, "Council vote recorded");

    // Check if quorum is now reached and auto-resolve
    const tally = await db.query(
      `SELECT COUNT(*)::int AS total FROM governance_votes WHERE dispute_id = $1`,
      [disputeId]
    );
    if (tally.rows[0].total >= dispute.quorum_required) {
      await db.query(
        "UPDATE governance_disputes SET status = 'resolved' WHERE id = $1",
        [disputeId]
      );
      logger.info({ disputeId }, "Dispute resolved — quorum reached");
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, disputeId, walletAddress }, "Failed to record vote");
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
