const nock = require('nock');
const { verifyProposal, normalizeOutcome } = require('../workers/truth-watcher');
const logger = require('../utils/logger');

describe('Truth-Watcher Automated Auditor', () => {
    let mockLoggerWarn;
    let mockLoggerInfo;
    let mockLoggerError;
    let consoleSpy;
    
    // Explicitly set the base URL to match tests
    process.env.TRUTH_API_BASE_URL = 'https://api.truthacles.com/v1';

    beforeAll(() => {
        nock.disableNetConnect();
    });

    afterAll(() => {
        nock.enableNetConnect();
        nock.cleanAll();
    });

    beforeEach(() => {
        mockLoggerWarn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        mockLoggerInfo = jest.spyOn(logger, 'info').mockImplementation(() => {});
        mockLoggerError = jest.spyOn(logger, 'error').mockImplementation(() => {});
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
        nock.cleanAll();
    });

    describe('normalizeOutcome', () => {
        it('should handle minor formatting differences', () => {
            expect(normalizeOutcome('Yes')).toBe('YES');
            expect(normalizeOutcome(' YES ')).toBe('YES');
            expect(normalizeOutcome('No')).toBe('NO');
            expect(normalizeOutcome(null)).toBe('');
            expect(normalizeOutcome(undefined)).toBe('');
            expect(normalizeOutcome(123)).toBe('123'); // handles toString
        });
    });

    describe('verifyProposal', () => {
        const url = 'https://api.truthacles.com/v1';
        
        it('should verify matching proposals successfully', async () => {
            nock(url)
                .get('/markets/001')
                .reply(200, { outcome: 'Yes' });

            const result = await verifyProposal('001', 'YES');
            
            expect(result).toBe(true);
            expect(mockLoggerInfo).toHaveBeenCalledWith(
                { marketId: '001' },
                "Truth proposal verified successfully"
            );
            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it('should verify matching proposals with different formatting', async () => {
            nock(url)
                .get('/markets/002')
                .reply(200, { outcome: ' no ' }); // Truth source says " no "

            const result = await verifyProposal('002', 'NO'); // Oracle proposed "NO"
            
            expect(result).toBe(true);
            expect(consoleSpy).not.toHaveBeenCalled();
        });

        it('should log an ALERT and return false when there is a data mismatch', async () => {
            nock(url)
                .get('/markets/003')
                .reply(200, { outcome: 'Yes' }); // Truth source says "Yes"

            const result = await verifyProposal('003', 'No'); // Oracle proposed "No"
            
            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith('[ALERT] Data Mismatch Detected for Market #003');
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                { marketId: '003', proposedOutcome: 'No', truthOutcome: 'Yes' },
                "Truth mismatch detected"
            );
        });

        it('should handle API network failures gracefully', async () => {
            nock(url)
                .get('/markets/004')
                .replyWithError('Network error');

            const result = await verifyProposal('004', 'Yes'); // Should gracefully fail
            
            expect(result).toBeNull();
            expect(mockLoggerError).toHaveBeenCalled();
        });

        it('should handle non-200 API responses gracefully', async () => {
            nock(url)
                .get('/markets/005')
                .reply(404, { error: 'Not found' });

            const result = await verifyProposal('005', 'Yes'); 
            
            expect(result).toBeNull();
            expect(mockLoggerError).toHaveBeenCalled();
        });
    });
});
