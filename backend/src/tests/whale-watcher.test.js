const nock = require('nock');
const { checkWhaleTransaction, triggerWebhook } = require('../workers/whale-watcher');
const logger = require('../utils/logger');

describe('Whale-Watch Large Transaction Alerts', () => {
    let mockLoggerWarn;
    let mockLoggerInfo;
    let mockLoggerError;
    let mockLoggerDebug;

    beforeAll(() => {
        nock.disableNetConnect();
        process.env.WHALE_THRESHOLD_XLM = '5000';
    });

    afterAll(() => {
        nock.enableNetConnect();
        nock.cleanAll();
    });

    beforeEach(() => {
        mockLoggerWarn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        mockLoggerInfo = jest.spyOn(logger, 'info').mockImplementation(() => {});
        mockLoggerError = jest.spyOn(logger, 'error').mockImplementation(() => {});
        mockLoggerDebug = jest.spyOn(logger, 'debug').mockImplementation(() => {});
        
        // Setup webhook url for testing
        process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock';
    });

    afterEach(() => {
        jest.clearAllMocks();
        nock.cleanAll();
        // Reset webhook url
        process.env.DISCORD_WEBHOOK_URL = undefined;
    });

    it('should ignore bets below or equal to threshold', async () => {
        const result = await checkWhaleTransaction('001', '5000', '0x123');
        expect(result).toBe(false);
        expect(mockLoggerWarn).not.toHaveBeenCalled();
    });

    it('should ignore invalid bets', async () => {
        const result = await checkWhaleTransaction('001', 'invalid', '0x123');
        expect(result).toBe(false);
    });

    it('should detect a whale transaction and trigger webhook', async () => {
        process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock';
        
        nock('https://discord.com')
            .post('/api/webhooks/mock')
            .reply(204);

        const result = await checkWhaleTransaction('002', '10000', '0xWhale');
        
        expect(result).toBe(true);
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            expect.objectContaining({
                market_id: '002',
                wallet_address: '0xWhale',
                amount: 10000
            }),
            "Whale transaction detected!"
        );
        expect(mockLoggerInfo).toHaveBeenCalledWith(
            { webhook: "success" },
            "Whale alert webhook sent successfully."
        );
    });

    it('should handle webhook failures gracefully', async () => {
        process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/mock';
        
        nock('https://discord.com')
            .post('/api/webhooks/mock')
            .replyWithError('Network timeout');

        const result = await checkWhaleTransaction('003', '5500', '0xFailed');
        
        expect(result).toBe(true); // Still a whale
        expect(mockLoggerError).toHaveBeenCalled();
    });

    it('should skip webhook if url is not configured', async () => {
        process.env.DISCORD_WEBHOOK_URL = '';
        
        await triggerWebhook('004', '6000', '0xSkip');
        
        expect(mockLoggerDebug).toHaveBeenCalledWith(
            "Webhook URL not configured, skipping notification."
        );
    });
});
