const request = require('supertest');
const express = require('express');
const statusRouter = require('../src/routes/status');
const db = require('../src/db');
const { SorobanRpc } = require('@stellar/stellar-sdk');

const app = express();
app.use(express.json());
app.use('/api/status', statusRouter);

// Mock db.query
jest.mock('../src/db', () => ({
    query: jest.fn()
}));

// Mock SorobanRpc.Server
jest.mock('@stellar/stellar-sdk', () => {
    const originalModule = jest.requireActual('@stellar/stellar-sdk');
    return {
        ...originalModule,
        SorobanRpc: {
            Server: jest.fn().mockImplementation(() => ({
                getLatestLedger: jest.fn()
            }))
        }
    };
});

describe('GET /api/status', () => {
    let mockGetLatestLedger;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetLatestLedger = jest.fn();
        SorobanRpc.Server.mockImplementation(() => ({
            getLatestLedger: mockGetLatestLedger
        }));
    });

    it('should return 200 and status "up" when all services are healthy', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
        mockGetLatestLedger.mockResolvedValueOnce({ sequence: 123456 });

        const res = await request(app).get('/api/status');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('up');
        expect(res.body.services.database.status).toBe('up');
        expect(typeof res.body.services.database.latency).toBe('number');
        expect(res.body.services.stellar.status).toBe('up');
        expect(typeof res.body.services.stellar.latency).toBe('number');
        expect(typeof res.body.uptime).toBe('number');
    });

    it('should return 200 and status "degraded" when database is down', async () => {
        db.query.mockRejectedValueOnce(new Error('Connection refused'));
        mockGetLatestLedger.mockResolvedValueOnce({ sequence: 123456 });

        const res = await request(app).get('/api/status');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('degraded');
        expect(res.body.services.database.status).toBe('down');
        expect(res.body.services.database.error).toBe('Connection refused');
        expect(res.body.services.database.latency).toBeNull();
        
        expect(res.body.services.stellar.status).toBe('up');
        expect(typeof res.body.services.stellar.latency).toBe('number');
    });

    it('should return 200 and status "degraded" when stellar is down', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
        mockGetLatestLedger.mockRejectedValueOnce(new Error('Network offline'));

        const res = await request(app).get('/api/status');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('degraded');
        expect(res.body.services.stellar.status).toBe('down');
        expect(res.body.services.stellar.error).toBe('Network offline');
        expect(res.body.services.stellar.latency).toBeNull();
        
        expect(res.body.services.database.status).toBe('up');
        expect(typeof res.body.services.database.latency).toBe('number');
    });

    it('should return 503 and status "down" when all services are down', async () => {
        db.query.mockRejectedValueOnce(new Error('DB Boom'));
        mockGetLatestLedger.mockRejectedValueOnce(new Error('Stellar Boom'));

        const res = await request(app).get('/api/status');
        expect(res.status).toBe(503);
        expect(res.body.status).toBe('down');
        expect(res.body.services.database.status).toBe('down');
        expect(res.body.services.database.error).toBe('DB Boom');
        expect(res.body.services.stellar.status).toBe('down');
        expect(res.body.services.stellar.error).toBe('Stellar Boom');
    });
});
