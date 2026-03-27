const express = require("express");
const router = express.Router();
const db = require("../db");
const { AuditLogger } = require("../utils/audit-logger");

const auditLogger = new AuditLogger();

// POST /api/audit-logs — create a new audit log entry
router.post("/", async (req, res) => {
  const { actor, action, details } = req.body;
  if (!actor || !action) {
    return res.status(400).json({ error: "actor and action are required" });
  }

  try {
    const timestamp = new Date().toISOString();

    // Pin to IPFS (non-blocking — null CID on failure)
    const ipfsCid = await auditLogger.log({ actor, action, details, timestamp });

    // Persist to database
    const result = await db.query(
      `INSERT INTO audit_logs (actor, action, details, ipfs_cid, timestamp)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [actor, action, JSON.stringify(details || {}), ipfsCid, timestamp]
    );

    res.status(201).json({ auditLog: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit-logs — list all audit log entries
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM audit_logs ORDER BY created_at DESC"
    );
    res.json({ auditLogs: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit-logs/:id — get a single audit log entry
router.get("/:id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM audit_logs WHERE id = $1",
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Audit log not found" });
    }
    res.json({ auditLog: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
