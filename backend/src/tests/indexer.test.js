'use strict';

jest.mock('../db');
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../indexer/mercury', () => ({
  subscribe: jest.fn(),
  processEvent: jest.fn(),
  handleBet: jest.fn(),
  handleMarketCreated: jest.fn(),
  handleMarketResolved: jest.fn(),
}));

const db = require('../db');
const mercury = require('../indexer/mercury');

// ── helpers ───────────────────────────────────────────────────────────────────

const META = { ledger_seq: 100, ledger_time: '2026-01-01T00:00:00Z' };

function makeEvent(topic, payload, overrides = {}) {
  return {
    topic,
    payload,
    tx_hash: 'abc123',
    event_index: 0,
    ledger_seq: 100,
    ledger_time: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── mercury event handlers ────────────────────────────────────────────────────

describe('mercury event handlers', () => {
  // Use the real implementations for handler tests
  const {
    handleBet,
    handleMarketCreated,
    handleMarketResolved,
  } = jest.requireActual('../indexer/mercury');

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
  });

  test('handleBet inserts bet and upserts user', async () => {
    await handleBet(
      { market_id: 1, bettor: 'GABC', outcome_index: 0, amount: '500' },
      META
    );
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO bets'),
      expect.arrayContaining([1, 'GABC', 0, '500'])
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['GABC', '500'])
    );
  });

  test('handleMarketCreated inserts market row', async () => {
    await handleMarketCreated(
      { id: 1, question: 'Will BTC hit $100k?', outcomes: ['Yes', 'No'], end_date: 1800000000, token: 'GTOKEN', category: 'crypto' },
      META
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO markets'),
      expect.arrayContaining([1, 'Will BTC hit $100k?'])
    );
  });

  test('handleMarketResolved updates market and credits winners', async () => {
    await handleMarketResolved({ market_id: 1, winning_outcome: 0 });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE markets'),
      [0, 1]
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE users'),
      [1, 0]
    );
  });
});

// ── processEvent dispatcher ───────────────────────────────────────────────────

describe('processEvent', () => {
  const { processEvent } = jest.requireActual('../indexer/mercury');

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
  });

  test('stores raw event and routes Bet topic', async () => {
    await processEvent(makeEvent('Bet', { market_id: 1, bettor: 'G1', outcome_index: 0, amount: '100' }));
    // First call: INSERT INTO events
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO events'),
      expect.any(Array)
    );
    // Second call: INSERT INTO bets (from handleBet)
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO bets'),
      expect.any(Array)
    );
  });

  test('stores raw event and routes MarketCreated topic', async () => {
    await processEvent(makeEvent('MarketCreated', { id: 2, question: 'Q', outcomes: ['Y', 'N'], end_date: 9999, token: 'T' }));
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO markets'),
      expect.any(Array)
    );
  });

  test('stores raw event and routes MarketResolved topic', async () => {
    await processEvent(makeEvent('MarketResolved', { market_id: 1, winning_outcome: 1 }));
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE markets'),
      expect.any(Array)
    );
  });

  test('stores unknown topic without throwing', async () => {
    await expect(processEvent(makeEvent('UnknownTopic', {}))).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledTimes(1); // only the INSERT INTO events
  });

  test('deduplicates events via ON CONFLICT', async () => {
    // Both calls should succeed — DB handles dedup via unique constraint
    await processEvent(makeEvent('Bet', { market_id: 1, bettor: 'G1', outcome_index: 0, amount: '100' }));
    await processEvent(makeEvent('Bet', { market_id: 1, bettor: 'G1', outcome_index: 0, amount: '100' }));
    // Each call inserts into events once
    const eventInserts = db.query.mock.calls.filter(([q]) => q.includes('INSERT INTO events'));
    expect(eventInserts).toHaveLength(2);
  });
});

// ── GraphQL resolvers ─────────────────────────────────────────────────────────

describe('GraphQL resolvers', () => {
  const resolvers = require('../graphql/resolvers');

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
  });

  test('market resolver returns null when not found', async () => {
    const result = await resolvers.Query.market(null, { id: 99 });
    expect(result).toBeNull();
  });

  test('market resolver returns row when found', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, question: 'Q' }] });
    const result = await resolvers.Query.market(null, { id: 1 });
    expect(result).toEqual({ id: 1, question: 'Q' });
  });

  test('markets resolver applies status filter', async () => {
    await resolvers.Query.markets(null, { status: 'ACTIVE' });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('status = $1'),
      expect.arrayContaining(['ACTIVE'])
    );
  });

  test('markets resolver applies category filter', async () => {
    await resolvers.Query.markets(null, { category: 'crypto' });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('category = $1'),
      expect.arrayContaining(['crypto'])
    );
  });

  test('markets resolver applies both filters', async () => {
    await resolvers.Query.markets(null, { status: 'ACTIVE', category: 'sports' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('status = $1');
    expect(sql).toContain('category = $2');
    expect(params).toContain('ACTIVE');
    expect(params).toContain('sports');
  });

  test('betsByWallet queries by wallet_address', async () => {
    await resolvers.Query.betsByWallet(null, { wallet_address: 'GABC' });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('wallet_address = $1'),
      expect.arrayContaining(['GABC'])
    );
  });

  test('betsByMarket queries by market_id', async () => {
    await resolvers.Query.betsByMarket(null, { market_id: 5 });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('market_id = $1'),
      expect.arrayContaining([5])
    );
  });

  test('marketStats returns aggregated data', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ bet_count: '10', unique_bettors: '5', total_pool: '1000' }] })
      .mockResolvedValueOnce({ rows: [{ outcome_index: 0, total_stake: '600', bet_count: '6' }] });

    const result = await resolvers.Query.marketStats(null, { market_id: 1 });
    expect(result.bet_count).toBe(10);
    expect(result.unique_bettors).toBe(5);
    expect(result.total_pool).toBe('1000');
    expect(result.outcome_stakes).toHaveLength(1);
    expect(result.outcome_stakes[0].outcome_index).toBe(0);
  });

  test('user resolver returns null when not found', async () => {
    const result = await resolvers.Query.user(null, { wallet_address: 'GXXX' });
    expect(result).toBeNull();
  });

  test('user resolver returns row when found', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ wallet_address: 'GABC', bet_count: 3 }] });
    const result = await resolvers.Query.user(null, { wallet_address: 'GABC' });
    expect(result.wallet_address).toBe('GABC');
  });

  test('events resolver applies topic filter', async () => {
    await resolvers.Query.events(null, { topic: 'Bet' });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('topic = $1'),
      expect.arrayContaining(['Bet'])
    );
  });

  test('events resolver serializes payload to string', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, payload: { market_id: 1 }, topic: 'Bet', contract_id: 'C', ledger_seq: 1, ledger_time: 't', tx_hash: 'h', event_index: 0, created_at: 't' }],
    });
    const result = await resolvers.Query.events(null, {});
    expect(typeof result[0].payload).toBe('string');
  });

  test('Market.bet_count field resolver queries count', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: '7' }] });
    const count = await resolvers.Market.bet_count({ id: 1 });
    expect(count).toBe(7);
  });

  test('Bet.market field resolver returns market', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1, question: 'Q' }] });
    const market = await resolvers.Bet.market({ market_id: 1 });
    expect(market.id).toBe(1);
  });

  test('User.bets field resolver returns bets', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const bets = await resolvers.User.bets({ wallet_address: 'GABC' });
    expect(bets).toHaveLength(2);
  });
});

// ── webhook route ─────────────────────────────────────────────────────────────

describe('POST /api/indexer/webhook', () => {
  const request = require('supertest');
  const express = require('express');

  const app = express();
  app.use('/api/indexer', require('../routes/indexer'));

  beforeEach(() => jest.clearAllMocks());

  test('returns 400 for invalid JSON', async () => {
    const res = await request(app)
      .post('/api/indexer/webhook')
      .set('Content-Type', 'application/json')
      .send('not-json');
    expect(res.status).toBe(400);
  });

  test('processes valid event array and returns counts', async () => {
    mercury.processEvent.mockResolvedValue(undefined);
    const event = makeEvent('Bet', { market_id: 1, bettor: 'G1', outcome_index: 0, amount: '100' });

    const res = await request(app)
      .post('/api/indexer/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify([event]));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: 1, processed: 1 });
  });

  test('processes single event object (not array)', async () => {
    mercury.processEvent.mockResolvedValue(undefined);
    const event = makeEvent('Bet', {});

    const res = await request(app)
      .post('/api/indexer/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(event));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(1);
  });

  test('counts failed events separately', async () => {
    mercury.processEvent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('db error'));

    const events = [makeEvent('Bet', {}), makeEvent('Bet', {}, { event_index: 1 })];

    const res = await request(app)
      .post('/api/indexer/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(events));

    expect(res.body).toMatchObject({ received: 2, processed: 1 });
  });

  test('GET /api/indexer/health returns ok', async () => {
    const res = await request(app).get('/api/indexer/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
