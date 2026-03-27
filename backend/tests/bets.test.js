const request = require('supertest');
const express = require('express');
const betsRouter = require('../src/routes/bets');
const db = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/bets', betsRouter);

jest.mock('../src/db', () => ({
  query: jest.fn()
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../src/bots/eventBus', () => ({
  emit: jest.fn()
}));

describe('POST /api/bets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // #376: Test duplicate bet rejection
  it('should return 409 Conflict when wallet places second bet on same market', async () => {
    const marketId = 1;
    const walletAddress = 'GTEST123';
    const outcomeIndex = 0;
    const amount = 100;

    // Mock market exists
    db.query.mockResolvedValueOnce({
      rows: [{ id: marketId, resolved: false, end_date: new Date(Date.now() + 3600000) }]
    });

    // Mock existing bet found
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1 }]
    });

    const res = await request(app)
      .post('/api/bets')
      .send({ marketId, outcomeIndex, amount, walletAddress });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Wallet has already placed a bet on this market');
  });

  // #376: Test successful first bet
  it('should allow first bet from wallet on market', async () => {
    const marketId = 1;
    const walletAddress = 'GTEST123';
    const outcomeIndex = 0;
    const amount = 100;

    // Mock market exists
    db.query.mockResolvedValueOnce({
      rows: [{ id: marketId, resolved: false, end_date: new Date(Date.now() + 3600000) }]
    });

    // Mock no existing bet
    db.query.mockResolvedValueOnce({
      rows: []
    });

    // Mock bet insertion
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, market_id: marketId, wallet_address: walletAddress, outcome_index: outcomeIndex, amount }]
    });

    // Mock pool update
    db.query.mockResolvedValueOnce({
      rows: []
    });

    // Mock pool fetch
    db.query.mockResolvedValueOnce({
      rows: [{ total_pool: 100 }]
    });

    const res = await request(app)
      .post('/api/bets')
      .send({ marketId, outcomeIndex, amount, walletAddress });

    expect(res.status).toBe(201);
    expect(res.body.bet).toBeDefined();
  });
});
