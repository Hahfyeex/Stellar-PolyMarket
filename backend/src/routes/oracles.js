const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { calculateTruthScore } = require('../utils/truth-score');

// GET /api/v1/oracles/stats — "Truth-Score" Oracle Monitoring Service
router.get("/stats", async (req, res) => {
    try {
        // Query the DB for Oracle stats (mocked aggregation for now since we don't have deep oracle tables but maybe we do in a real app)
        // Let's assume there is an oracle_stats table or we aggregate from proposals table.
        // For the sake of this mock endpoint, we will generate dynamic data if DB fails, or try a realistic query.
        
        // This query attempts to group proposals if we had such a schema. 
        // We will mock the database response to demonstrate the functionality as requested by the prompt.
        const stats = {
            "0xOracleMaster123": {
                successfulProposals: 45,
                overturnedDisputes: 2,
                uptimeMinutesAvg: 12
            },
            "0xFastProposer456": {
                successfulProposals: 10,
                overturnedDisputes: 5,
                uptimeMinutesAvg: 5
            },
            "0xReliableNode789": {
                successfulProposals: 120,
                overturnedDisputes: 0,
                uptimeMinutesAvg: 30
            }
        };

        const response = [];

        for (const [address, data] of Object.entries(stats)) {
            const score = calculateTruthScore(data.successfulProposals, data.overturnedDisputes);
            
            response.push({
                oracle_address: address,
                successful_proposals: data.successfulProposals,
                overturned_disputes: data.overturnedDisputes,
                uptime_avg: `${data.uptimeMinutesAvg} mins`,
                truth_score: score
            });
        }

        // Sort by truth score descending
        response.sort((a, b) => b.truth_score - a.truth_score);

        logger.info({ oracles_count: response.length }, "Oracle stats fetched successfully");
        res.json({
            status: "success",
            data: response
        });
    } catch (err) {
        logger.error({ err }, "Failed to fetch oracle stats");
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
