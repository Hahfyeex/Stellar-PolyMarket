const express = require("express");  
const router = express.Router();  
const db = require("../db");  
const logger = require("../utils/logger");  
const { calculateReputation } = require("../utils/creators");  

// GET /api/creators/:wallet/reputation  
router.get("/:wallet/reputation", async (req, res) => {  
  try {  
    const { wallet } = req.params;  
    if (!wallet || wallet.length < 50) {  
      return res.status(400).json({ error: "Invalid wallet address" });  
    }  

    const result = await db.query(  
      "SELECT * FROM market_creators WHERE wallet_address = $1",  
      [wallet]  
    );  

    if (!result.rows.length) {  
      return res.status(404).json({  
        error: "Creator not found",  
        message: "No markets created by this wallet yet"  
      });  
    }  

    const stats = result.rows[0];  
    const breakdown = {  
      ...stats,  
      accuracy_pct: stats.markets_created > 0 ? (stats.markets_resolved_correctly / stats.markets_created * 100).toFixed(2) : 0,  
      penalties: {  
        disputes: stats.markets_disputed * 5,  
        voids: stats.markets_voided * 10  
      }  
    };  

    logger.debug({ wallet: wallet.slice(0, 8) + "...", reputation: stats.reputation_score }, "Creator reputation fetched");  

    res.json({  
      creator: wallet,  
      reputation_score: stats.reputation_score,  
      breakdown  
    });  
  } catch (err) {  
    logger.error({ err, wallet: req.params.wallet }, "Failed to fetch creator reputation");  
    res.status(500).json({ error: err.message });  
  }  
});  

module.exports = router;  

