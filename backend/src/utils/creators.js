const logger = require("./logger");  

/**  
 * Calculate creator reputation score  
 * Formula: clamp((resolved_correctly / created * 100) - (disputed * 5) - (voided * 10), 0, 100)  
 */  
function calculateReputation({  
  markets_created,  
  markets_resolved_correctly,  
  markets_disputed,  
  markets_voided  
}) {  
  if (markets_created === 0) return 0;  
  const accuracyPct = (markets_resolved_correctly / markets_created) * 100;  
  let score = accuracyPct - (markets_disputed * 5) - (markets_voided * 10);  
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));  
}  

/**  
 * Upsert creator stats (increment counters, recalc score)  
 */  
async function updateCreatorStats(db, wallet_address, increments = {}) {  
  const {  
    markets_created = 0,  
    markets_resolved_correctly = 0,  
    markets_disputed = 0,  
    markets_voided = 0  
  } = increments;  

  // Atomic UPSERT  
  const result = await db.query(  
    `  
    INSERT INTO market_creators (wallet_address, markets_created, markets_resolved_correctly, markets_disputed, markets_voided, reputation_score, updated_at)  
    VALUES ($1, $2, $3, $4, $5, $6, NOW())  
    ON CONFLICT (wallet_address) DO UPDATE SET  
      markets_created = market_creators.markets_created + EXCLUDED.markets_created,  
      markets_resolved_correctly = market_creators.markets_resolved_correctly + EXCLUDED.markets_resolved_correctly,  
      markets_disputed = market_creators.markets_disputed + EXCLUDED.markets_disputed,  
      markets_voided = market_creators.markets_voided + EXCLUDED.markets_voided,  
      reputation_score = $6,  
      updated_at = NOW()  
    RETURNING *  
    `,  
    [  
      wallet_address,  
      markets_created,  
      markets_resolved_correctly,  
      markets_disputed,  
      markets_voided,  
      calculateReputation({  
        markets_created,  
        markets_resolved_correctly,  
        markets_disputed,  
        markets_voided  
      })  
    ]  
  );  

  return result.rows[0];  
}  

module.exports = { calculateReputation, updateCreatorStats };  

