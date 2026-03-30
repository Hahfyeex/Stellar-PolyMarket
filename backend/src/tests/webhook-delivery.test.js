const axios = require('axios');
const db = require('../db');
const WebhookDeliveryService = require('../services/webhookDeliveryService');
const nock = require('nock');

jest.mock('../db', () => ({
    query: jest.fn()
}));

describe('Webhook Delivery Retry with Exponential Backoff', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        nock.cleanAll();
    });

    describe('enqueueDelivery', () => {
        it('should insert a PENDING record into the database', async () => {
            db.query.mockResolvedValueOnce({ rows: [{ id: 123 }] });
            
            const deliveryId = await WebhookDeliveryService.enqueueDelivery(1, 'market.resolved', { marketId: 456 });
            
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO webhook_deliveries'),
                [1, 'market.resolved', JSON.stringify({ marketId: 456 })]
            );
            expect(deliveryId).toBe(123);
        });
    });

    describe('deliver', () => {
        const mockDelivery = {
            id: 1,
            webhook_id: 10,
            url: 'https://example.com/webhook',
            event_type: 'test.event',
            payload: { data: 'test' },
            attempts: 0
        };

        it('should mark as DELIVERED on success', async () => {
            nock('https://example.com')
                .post('/webhook')
                .reply(200);

            await WebhookDeliveryService.deliver(mockDelivery);

            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("SET status = 'DELIVERED'"),
                [1, 200, 1]
            );
        });

        it('should increment attempts and set backoff on first failure', async () => {
            nock('https://example.com')
                .post('/webhook')
                .reply(500);

            await WebhookDeliveryService.deliver(mockDelivery);

            // currentAttempt = 1, backoff = 2^1 = 2 minutes
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("next_attempt_at = NOW() + INTERVAL '2 minutes'"),
                [1, 500, 'Request failed with status code 500', 1]
            );
        });

        it('should use exponential backoff (2^attempts)', async () => {
            const deliveryAttempt2 = { ...mockDelivery, attempts: 2 };
            nock('https://example.com')
                .post('/webhook')
                .reply(500);

            await WebhookDeliveryService.deliver(deliveryAttempt2);

            // currentAttempt = 3, backoff = 2^3 = 8 minutes
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("next_attempt_at = NOW() + INTERVAL '8 minutes'"),
                [3, 500, 'Request failed with status code 500', 1]
            );
        });

        it('should mark as FAILED after 5 attempts', async () => {
            const deliveryAttempt4 = { ...mockDelivery, attempts: 4 };
            nock('https://example.com')
                .post('/webhook')
                .reply(500);

            await WebhookDeliveryService.deliver(deliveryAttempt4);

            // currentAttempt = 5, which is >= maxAttempts (5)
            expect(db.query).toHaveBeenCalledWith(
                expect.stringContaining("SET status = 'FAILED'"),
                [5, 500, 'Request failed with status code 500', 1]
            );
        });
    });

    describe('processPendingDeliveries', () => {
        it('should process pending deliveries that are due', async () => {
            const pendingDeliveries = [
                { id: 1, url: 'https://a.com', event_type: 'e1', payload: {}, attempts: 0 },
                { id: 2, url: 'https://b.com', event_type: 'e2', payload: {}, attempts: 1 }
            ];
            db.query.mockResolvedValueOnce({ rows: pendingDeliveries });

            // Mock deliver method
            const deliverSpy = jest.spyOn(WebhookDeliveryService, 'deliver').mockResolvedValue(null);

            await WebhookDeliveryService.processPendingDeliveries();

            expect(deliverSpy).toHaveBeenCalledTimes(2);
            expect(deliverSpy).toHaveBeenCalledWith(pendingDeliveries[0]);
            expect(deliverSpy).toHaveBeenCalledWith(pendingDeliveries[1]);
            
            deliverSpy.mockRestore();
        });
    });
});
