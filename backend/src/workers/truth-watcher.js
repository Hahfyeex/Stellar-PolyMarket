const axios = require('axios');
const logger = require('../utils/logger');

const TRUTH_API_BASE_URL = process.env.TRUTH_API_BASE_URL || 'https://api.truthacles.com/v1';

/**
 * Normalizes a string to uppercase and trims for comparison
 * Handles minor formatting differences like "Yes" vs "YES"
 */
function normalizeOutcome(outcome) {
    if (!outcome) return '';
    return outcome.toString().trim().toUpperCase();
}

/**
 * Verifies a proposed outcome against an external Truth API
 * @param {string} marketId The ID of the market
 * @param {string} proposedOutcome The outcome proposed by the Oracle
 */
async function verifyProposal(marketId, proposedOutcome) {
    try {
        const response = await axios.get(`${TRUTH_API_BASE_URL}/markets/${marketId}`);
        const { outcome: truthOutcome } = response.data;

        if (normalizeOutcome(truthOutcome) !== normalizeOutcome(proposedOutcome)) {
            console.log(`[ALERT] Data Mismatch Detected for Market #${marketId}`);
            logger.warn({ 
                marketId, 
                proposedOutcome, 
                truthOutcome 
            }, "Truth mismatch detected");
            return false;
        }

        logger.info({ marketId }, "Truth proposal verified successfully");
        return true;
    } catch (error) {
        logger.error({ 
            err: error.message, 
            marketId 
        }, "Failed to verify proposal against Truth API");
        return null;
    }
}

module.exports = {
    verifyProposal,
    normalizeOutcome
};
