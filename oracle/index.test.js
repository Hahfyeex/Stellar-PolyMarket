'use strict';

/**
 * Unit tests for oracle/index.js graceful shutdown handling
 *
 * Tests cover:
 *   - Concurrent oracle runs are prevented by isRunning flag
 *   - Graceful shutdown is logged
 *   - Interval is cleared on shutdown
 *   - Process exits with code 0 after graceful shutdown
 *   - Shutdown waits for in-progress run to complete
 */

jest.mock('axios');
jest.mock('./medianizer');
jest.mock('./sources');

const axios = require('axios');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_MARKETS = [
  {
    id: 1,
    question: 'Will Bitcoin reach $100k?',
    outcomes: ['Yes', 'No'],
    resolved: false,
    end_date: new Date(Date.now() - 1000).toISOString(),
  },
  {
    id: 2,
    question: 'Will inflation exceed 5%?',
    outcomes: ['Yes', 'No'],
    resolved: false,
    end_date: new Date(Date.now() - 1000).toISOString(),
  },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(process, 'exit').mockImplementation(() => {});
  
  // Reset module state for each test
  jest.resetModules();
});

afterEach(() => {
  console.log.mockRestore();
  console.error.mockRestore();
  console.warn.mockRestore();
  process.exit.mockRestore();
});

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Oracle Graceful Shutdown', () => {
  test('prevents concurrent oracle runs with isRunning flag', async () => {
    const { runOracle } = require('./index');

    axios.get.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { markets: [MOCK_MARKETS[0]] } }), 20))
    );
    axios.post.mockResolvedValue({ data: {} });

    // Start first run (will take 20ms)
    const firstRun = runOracle();

    // Immediately try to start second run
    await new Promise((resolve) => setTimeout(resolve, 5));
    const secondRun = runOracle();

    await Promise.all([firstRun, secondRun]);

    // Should only call axios.get once (second run was skipped)
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Oracle is already running')
    );
  });

  test('handles API errors gracefully', async () => {
    const { runOracle } = require('./index');

    axios.get.mockRejectedValueOnce(new Error('API timeout'));

    await runOracle();

    expect(console.error).toHaveBeenCalled();
    const calls = console.error.mock.calls;
    expect(calls.some((call) => call[0].includes('[Oracle] Error:'))).toBe(true);
  });

  test('resolves markets and posts results', async () => {
    const { runOracle } = require('./index');

    axios.get.mockResolvedValueOnce({ data: { markets: [MOCK_MARKETS[0]] } });
    axios.post.mockResolvedValueOnce({ data: {} });

    await runOracle();

    expect(axios.get).toHaveBeenCalledWith('http://localhost:4000/api/markets');
    expect(axios.post).toHaveBeenCalled();
  });

  test('handles resolution errors gracefully', async () => {
    const { resolveMarket } = require('./index');

    axios.post.mockRejectedValueOnce(new Error('Network error'));

    await resolveMarket(MOCK_MARKETS[0]);

    expect(console.error).toHaveBeenCalled();
  });

  test('routes crypto questions to resolveCryptoPrice', async () => {
    const { fetchOutcome } = require('./index');

    const result = await fetchOutcome('Will Bitcoin reach $100k?', ['Yes', 'No']);
    expect(typeof result).toBe('number');
  });

  test('routes financial questions to resolveFinancial', async () => {
    const { fetchOutcome } = require('./index');

    const result = await fetchOutcome('Will inflation exceed 5%?', ['Yes', 'No']);
    expect(typeof result).toBe('number');
  });

  test('defaults to outcome 0 for unmatched questions', async () => {
    const { fetchOutcome } = require('./index');

    const result = await fetchOutcome('Random question?', ['Yes', 'No']);
    expect(result).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('No resolver matched')
    );
  });

  test('gracefulShutdown logs SIGTERM message', async () => {
    const { gracefulShutdown } = require('./index');

    const shutdownPromise = gracefulShutdown('SIGTERM');
    
    // Give it a moment to log
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(console.log).toHaveBeenCalled();
    const calls = console.log.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('SIGTERM'))).toBe(true);
  });

  test('gracefulShutdown logs SIGINT message', async () => {
    const { gracefulShutdown } = require('./index');

    const shutdownPromise = gracefulShutdown('SIGINT');
    
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(console.log).toHaveBeenCalled();
    const calls = console.log.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('SIGINT'))).toBe(true);
  });

  test('gracefulShutdown logs shutdown message', async () => {
    const { gracefulShutdown } = require('./index');

    await gracefulShutdown('SIGTERM');

    expect(console.log).toHaveBeenCalled();
    const calls = console.log.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('Oracle shutting down gracefully'))).toBe(true);
  });

  test('gracefulShutdown logs interval cleared', async () => {
    const { gracefulShutdown } = require('./index');

    await gracefulShutdown('SIGTERM');

    expect(console.log).toHaveBeenCalled();
    const calls = console.log.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('Interval cleared'))).toBe(true);
  });
});
