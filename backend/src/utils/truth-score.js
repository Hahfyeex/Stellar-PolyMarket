/**
 * Calculates the "Truth-Score" for an Oracle based on their historical performance.
 * 
 * Formula:
 * Truth-Score = max(0, (successfulProposals * 10) - (overturnedDisputes * 50))
 * 
 * @param {number} successfulProposals Number of times the Oracle's proposal was the final resolution
 * @param {number} overturnedDisputes Number of times the Oracle's proposal was overturned by a dispute
 * @returns {number} The calculated Truth-Score (minimum 0)
 */
function calculateTruthScore(successfulProposals, overturnedDisputes) {
    if (typeof successfulProposals !== 'number' || typeof overturnedDisputes !== 'number') {
        return 0;
    }
    
    if (successfulProposals < 0 || overturnedDisputes < 0) {
        return 0;
    }

    const SUCCESS_WEIGHT = 10;
    const PENALTY_WEIGHT = 50;

    const score = (successfulProposals * SUCCESS_WEIGHT) - (overturnedDisputes * PENALTY_WEIGHT);
    return Math.max(0, score);
}

module.exports = {
    calculateTruthScore
};
