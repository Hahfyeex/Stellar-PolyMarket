/**
 * Calculates odds for multiple outcomes in a prediction market.
 * Odds are expressed as percentages (probability).
 * 
 * @param {Array<{ index: number, pool: string | number }>} poolData
 * @param {string | number} totalPool 
 * @returns {Array<{ index: number, odds: number }>}
 */
function calculateOdds(poolData, totalPool) {
    if (!poolData || !Array.isArray(poolData) || poolData.length === 0) {
        return [];
    }
    
    let total = parseFloat(totalPool);
    
    // Fallback: If totalPool is not provided, sum it up
    if (isNaN(total) || total <= 0) {
        total = poolData.reduce((acc, curr) => acc + (parseFloat(curr.pool) || 0), 0);
    }
    
    if (isNaN(total) || total <= 0) {
        // If total pool is still 0, split evenly
        const evenOdds = 100 / poolData.length;
        return poolData.map(p => ({
            index: p.index,
            odds: Math.round(evenOdds * 100) / 100
        }));
    }

    return poolData.map(p => {
        const itemPool = parseFloat(p.pool) || 0;
        if (itemPool < 0) {
            return { index: p.index, odds: 0 };
        }
        const odds = (itemPool / total) * 100;
        return {
            index: p.index,
            odds: Math.round(odds * 100) / 100
        };
    });
}

module.exports = {
    calculateOdds
};
