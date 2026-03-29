const express = require("express");
const router = express.Router();
const userService = require("../services/userService");
const logger = require("../utils/logger");

/**
 * DELETE /api/users/:walletAddress/gdpr
 * GDPR-compliant user data deletion request.
 * Scrubs PII while maintaining wallet_address for relational integrity.
 */
router.delete("/:walletAddress/gdpr", async (req, res) => {
  const { walletAddress } = req.params;

  try {
    const result = await userService.scrubUser(walletAddress);
    
    logger.info({ wallet_address: walletAddress }, "GDPR deletion request processed");
    
    res.json({
      success: true,
      message: "User PII has been successfully scrubbed and audit logged.",
      user: result.user,
      auditLogId: result.auditLogId,
    });
  } catch (err) {
    if (err.message === "User not found") {
      return res.status(404).json({ error: "User not found" });
    }
    logger.error({ err, wallet_address: walletAddress }, "Failed to process GDPR deletion request");
    res.status(500).json({ error: "Internal server error during GDPR data scrubbing" });
  }
});

module.exports = router;
