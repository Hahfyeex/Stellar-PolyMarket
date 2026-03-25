const { calculateTruthScore } = require('../utils/truth-score');

describe('Truth-Score Algorithm', () => {
    it('should calculate score correctly for perfect oracles', () => {
        expect(calculateTruthScore(10, 0)).toBe(100);
    });

    it('should penalize overturned disputes heavily', () => {
        expect(calculateTruthScore(10, 1)).toBe(50); // 100 - 50 = 50
    });

    it('should not return a negative score', () => {
        expect(calculateTruthScore(2, 1)).toBe(0); // 20 - 50 = -30 -> 0
    });

    it('should handle zero inputs', () => {
        expect(calculateTruthScore(0, 0)).toBe(0);
    });

    it('should handle invalid inputs gracefully', () => {
        expect(calculateTruthScore('10', 0)).toBe(0);
        expect(calculateTruthScore(10, null)).toBe(0);
        expect(calculateTruthScore(-5, 2)).toBe(0);
        expect(calculateTruthScore(10, -1)).toBe(0);
    });
});
