const { calculateOdds } = require('../utils/math');

describe('Math Module', () => {
    describe('calculateOdds', () => {
        it('should return empty array if poolData is invalid', () => {
            expect(calculateOdds(null, 100)).toEqual([]);
            expect(calculateOdds([], 100)).toEqual([]);
            expect(calculateOdds({}, 100)).toEqual([]);
        });

        it('should calculate odds correctly with a valid total pool', () => {
            const data = [
                { index: 0, pool: 600 },
                { index: 1, pool: 400 }
            ];
            const odds = calculateOdds(data, 1000);
            expect(odds).toEqual([
                { index: 0, odds: 60 },
                { index: 1, odds: 40 }
            ]);
        });

        it('should split evenly if total pool is 0', () => {
            const data = [
                { index: 0, pool: 0 },
                { index: 1, pool: 0 }
            ];
            const odds = calculateOdds(data, 0);
            expect(odds).toEqual([
                { index: 0, odds: 50 },
                { index: 1, odds: 50 }
            ]);
        });

        it('should calculate the total pool if not provided or <= 0, and not 0 after sum', () => {
            const data = [
                { index: 0, pool: 75 },
                { index: 1, pool: 25 }
            ];
            const odds = calculateOdds(data, 0); // it should sum up the array
            expect(odds).toEqual([
                { index: 0, odds: 75 },
                { index: 1, odds: 25 }
            ]);
        });

        it('should handle rounding optimally', () => {
            const data = [
                { index: 0, pool: 1 },
                { index: 1, pool: 2 }
            ];
            const odds = calculateOdds(data, 3);
            expect(odds).toEqual([
                { index: 0, odds: 33.33 },
                { index: 1, odds: 66.67 }
            ]);
        });

        it('should handle string pool values correctly', () => {
             const data = [
                { index: 0, pool: "50" },
                { index: 1, pool: "50" }
            ];
            const odds = calculateOdds(data, "100");
            expect(odds).toEqual([
                { index: 0, odds: 50 },
                { index: 1, odds: 50 }
            ]);
        });

        it('should return 0 odds for invalid or negative negative pool amounts', () => {
             const data = [
                { index: 0, pool: "fail" },
                { index: 1, pool: -50 }
            ];
            // Total would be 0 without totalPool passed, triggering evenly split
            // If total is explicit, the invalid amounts are treated as 0 logic
            const odds = calculateOdds(data, 100);
            expect(odds).toEqual([
                { index: 0, odds: 0 },
                { index: 1, odds: 0 }
            ]);
        });
    });
});
