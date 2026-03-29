'use strict';
/**
 * Tests for high-value market two-factor confirmation admin endpoints.
 * POST /api/admin/markets/:id/confirm-resolution
 * POST /api/admin/markets/:id/reject-resolution
 */

jest.mock('../db');
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../utils/redis', () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = 'test-secret';
process.env.JWT_SECRET = JWT_SECRET;

const adminRouter = require('../routes/admin');
const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

const token = jwt.sign({ sub: 'admin-wallet', role: 'admin' }, JWT_SECRET);

function makeMarket(overrides) {
  return Object.assign(
    {
      id: 1,
      question: 'Will BTC reach $100k?',
      outcomes: ['Yes', 'No'],
      resolved: false,
      status: 'PENDING_CONFIRMATION',
      proposed_outcome: 0,
      total_pool: '200000000000',
    },
    overrides
  );
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/admin/markets/:id/confirm-resolution', () => {
  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/admin/markets/1/confirm-resolution');
    expect(res.status).toBe(401);
  });

  test('returns 404 when market not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/admin/markets/99/confirm-resolution')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 409 when market is not PENDING_CONFIRMATION', async () => {
    db.query.mockResolvedValueOnce({ rows: [makeMarket({ status: 'ACTIVE' })] });
    const res = await request(app)
      .post('/api/admin/markets/1/confirm-resolution')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  test('finalizes resolution and returns 200', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [makeMarket()] })   // SELECT
      .mockResolvedValueOnce({ rows: [] })               // UPDATE markets
      .mockResolvedValueOnce({ rows: [] });              // audit log

    const res = await request(app)
      .post('/api/admin/markets/1/confirm-resolution')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, market_id: 1, winning_outcome: 0 });

    const updateCall = db.query.mock.calls.find((c) => c[0].includes('RESOLVED'));
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toEqual([0, 1]);
  });
});

describe('POST /api/admin/markets/:id/reject-resolution', () => {
  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/admin/markets/1/reject-resolution');
    expect(res.status).toBe(401);
  });

  test('returns 404 when market not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/admin/markets/1/reject-resolution')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 409 when market is not PENDING_CONFIRMATION', async () => {
    db.query.mockResolvedValueOnce({ rows: [makeMarket({ status: 'RESOLVED' })] });
    const res = await request(app)
      .post('/api/admin/markets/1/reject-resolution')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  test('returns market to ACTIVE and clears proposed_outcome', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [makeMarket()] })   // SELECT
      .mockResolvedValueOnce({ rows: [] })               // UPDATE markets
      .mockResolvedValueOnce({ rows: [] });              // audit log

    const res = await request(app)
      .post('/api/admin/markets/1/reject-resolution')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, market_id: 1 });

    const updateCall = db.query.mock.calls.find((c) => c[0].includes("ACTIVE"));
    expect(updateCall).toBeDefined();
  });
});
