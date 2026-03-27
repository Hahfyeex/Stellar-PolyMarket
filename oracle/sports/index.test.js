'use strict';

/**
 * Integration test: Sports API → On-chain Resolution Pipeline
 *
 * All external I/O (API-Football, Stellar RPC, backend HTTP) is mocked.
 * Tests cover:
 *   - Happy path: API result → correct outcome → on-chain tx
 *   - Retry logic: transient failures trigger backoff, succeed on 3rd attempt
 *   - API timeout: treated as a retryable error
 *   - Dead-letter: market is dead-lettered after MAX_ATTEMPTS failures
 *   - Keypair safety: secret key never appears in logs or error messages
 *   - sanitizeErrorMessage: strips Stellar secret keys from strings
 *   - parseTeamName: various question formats
 *   - Full pipeline via runCycle with mocked HTTP
 */

jest.mock('./sportsApi');
jest.mock('./stellarResolver');
jest.mock('axios');
// Mock the logger so we can assert on log calls without console noise
jest.mock('../../backend/src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
}));

const axios              = require('axios');
const { didTeamWin }     = require('./sportsApi');
const { resolveMarketOnChain } = require('./stellarResolver');
const logger             = require('../../backend/src/utils/logger');

const {
  runCycle,
  resolveMarketWithRetry,
  fetchSportsOutcome,
  parseTeamName,
  deadLetter,
  sanitizeErrorMessage,
  delay,
} = require('./index');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_MARKET = {
  id: 42,
  question: 'Will Arsenal win the Premier League?',
  category: 'sports',
  resolved: false,
  end_date: new Date(Date.now() - 1000).toISOString(), // already expired
};

const MOCK_TX_HASH = 'abc123txhash';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Stub delay so tests run instantly
  jest.spyOn(global, 'setTimeout').mockImplementation((fn) => { fn(); return 0; });
});

// ── parseTeamName ─────────────────────────────────────────────────────────────

describe('parseTeamName', () => {
  test('parses "Will X win" pattern', () => {
    expect(parseTeamName('Will Arsenal win the Premier League?')).toBe('Arsenal');
  });

  test('parses "Does X beat" pattern', () => {
    expect(parseTeamName('Does Manchester City beat Chelsea?')).toBe('Manchester City');
  });

  test('returns null for unrecognised format', () => {
    expect(parseTeamName('Who will score first?')).toBeNull();
  });

  test('handles multi-word team names', () => {
    expect(parseTeamName('Will Real Madrid win La Liga?')).toBe('Real Madrid');
  });
});

// ── sanitizeErrorMessage ──────────────────────────────────────────────────────

describe('sanitizeErrorMessage', () => {
  test('redacts a Stellar secret key embedded in a message', () => {
    const secret = 'SCZANGBA5RLGSRSGIDJIS7LJFTD7QDNALISWLGFNQO3UFUQNUI4UOQWH';
    const msg    = `Failed to sign: ${secret} is invalid`;
    expect(sanitizeErrorMessage(msg)).not.toContain(secret);
    expect(sanitizeErrorMessage(msg)).toContain('[REDACTED_SECRET]');
  });

  test('leaves normal error messages unchanged', () => {
    const msg = 'Team not found: Arsenal';
    expect(sanitizeErrorMessage(msg)).toBe(msg);
  });

  test('handles non-string input', () => {
    expect(sanitizeErrorMessage(42)).toBe('42');
  });
});

// ── fetchSportsOutcome ────────────────────────────────────────────────────────

describe('fetchSportsOutcome', () => {
  test('returns 0 when team won', async () => {
    didTeamWin.mockResolvedValue({ won: true, fixture: {}, team: { name: 'Arsenal' } });
    const outcome = await fetchSportsOutcome(MOCK_MARKET);
    expect(outcome).toBe(0);
    expect(didTeamWin).toHaveBeenCalledWith('Arsenal');
  });

  test('returns 1 when team did not win', async () => {
    didTeamWin.mockResolvedValue({ won: false, fixture: {}, team: { name: 'Arsenal' } });
    const outcome = await fetchSportsOutcome(MOCK_MARKET);
    expect(outcome).toBe(1);
  });

  test('throws when team name cannot be parsed', async () => {
    const badMarket = { ...MOCK_MARKET, question: 'Who scores first?' };
    await expect(fetchSportsOutcome(badMarket)).rejects.toThrow('Cannot parse team name');
  });

  test('propagates API errors', async () => {
    didTeamWin.mockRejectedValue(new Error('API timeout'));
    await expect(fetchSportsOutcome(MOCK_MARKET)).rejects.toThrow('API timeout');
  });
});

// ── resolveMarketWithRetry ────────────────────────────────────────────────────

describe('resolveMarketWithRetry', () => {
  beforeEach(() => {
    // Log endpoint always succeeds
    axios.post.mockResolvedValue({ data: { ok: true } });
  });

  test('resolves successfully on first attempt', async () => {
    didTeamWin.mockResolvedValue({ won: true, fixture: {}, team: {} });
    resolveMarketOnChain.mockResolvedValue(MOCK_TX_HASH);

    const result = await resolveMarketWithRetry(MOCK_MARKET);

    expect(result.txHash).toBe(MOCK_TX_HASH);
    expect(result.winningOutcome).toBe(0);
    expect(resolveMarketOnChain).toHaveBeenCalledTimes(1);
    expect(resolveMarketOnChain).toHaveBeenCalledWith(42, 0);
  });

  test('retries on transient failure and succeeds on 3rd attempt', async () => {
    didTeamWin.mockResolvedValue({ won: false, fixture: {}, team: {} });
    resolveMarketOnChain
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce(MOCK_TX_HASH);

    const result = await resolveMarketWithRetry(MOCK_MARKET);

    expect(result.txHash).toBe(MOCK_TX_HASH);
    expect(resolveMarketOnChain).toHaveBeenCalledTimes(3);
  });

  test('applies exponential backoff between retries', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn) => { fn(); return 0; });
    didTeamWin.mockResolvedValue({ won: true, fixture: {}, team: {} });
    resolveMarketOnChain
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(MOCK_TX_HASH);

    await resolveMarketWithRetry(MOCK_MARKET);

    // setTimeout called for backoff after attempt 1 (1000ms) and attempt 2 (2000ms)
    const backoffCalls = setTimeoutSpy.mock.calls.map(([, ms]) => ms);
    expect(backoffCalls).toContain(1000);
    expect(backoffCalls).toContain(2000);
  });

  test('throws after MAX_ATTEMPTS failures', async () => {
    didTeamWin.mockRejectedValue(new Error('API down'));
    resolveMarketOnChain.mockRejectedValue(new Error('RPC down'));

    await expect(resolveMarketWithRetry(MOCK_MARKET)).rejects.toThrow();
    expect(resolveMarketOnChain).toHaveBeenCalledTimes(3);
  });

  test('handles API timeout as retryable error', async () => {
    const timeoutErr = new Error('timeout of 8000ms exceeded');
    timeoutErr.code  = 'ECONNABORTED';
    didTeamWin.mockRejectedValue(timeoutErr);
    resolveMarketOnChain.mockResolvedValue(MOCK_TX_HASH);

    // All 3 attempts fail on the API side
    await expect(resolveMarketWithRetry(MOCK_MARKET)).rejects.toThrow('timeout');
    expect(didTeamWin).toHaveBeenCalledTimes(3);
  });

  test('logs each attempt without exposing the secret key', async () => {
    const secretKey = 'SCZANGBA5RLGSRSGIDJIS7LJFTD7QDNALISWLGFNQO3UFUQNUI4UOQWH';
    didTeamWin.mockRejectedValue(new Error(`key ${secretKey} failed`));
    resolveMarketOnChain.mockRejectedValue(new Error('rpc error'));

    await expect(resolveMarketWithRetry(MOCK_MARKET)).rejects.toThrow();

    // Inspect all warn calls — none should contain the raw secret
    const allWarnArgs = logger.warn.mock.calls.flat(Infinity).map(String).join(' ');
    expect(allWarnArgs).not.toContain(secretKey);
  });

  test('logs successful resolution with tx hash', async () => {
    didTeamWin.mockResolvedValue({ won: true, fixture: {}, team: {} });
    resolveMarketOnChain.mockResolvedValue(MOCK_TX_HASH);

    await resolveMarketWithRetry(MOCK_MARKET);

    const infoArgs = logger.info.mock.calls.flat(Infinity).map(String).join(' ');
    expect(infoArgs).toContain(MOCK_TX_HASH);
  });
});

// ── deadLetter ────────────────────────────────────────────────────────────────

describe('deadLetter', () => {
  test('posts to dead-letter endpoint', async () => {
    axios.post.mockResolvedValue({ data: {} });
    await deadLetter(MOCK_MARKET, new Error('all retries failed'));
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/oracle/dead-letter'),
      expect.objectContaining({ market_id: 42, oracle_type: 'sports' }),
      expect.any(Object)
    );
  });

  test('does not expose secret key in dead-letter payload', async () => {
    axios.post.mockResolvedValue({ data: {} });
    const secret = 'SCZANGBA5RLGSRSGIDJIS7LJFTD7QDNALISWLGFNQO3UFUQNUI4UOQWH';
    await deadLetter(MOCK_MARKET, new Error(`secret: ${secret}`));

    const postedBody = axios.post.mock.calls[0][1];
    expect(JSON.stringify(postedBody)).not.toContain(secret);
  });

  test('handles dead-letter endpoint failure gracefully', async () => {
    axios.post.mockRejectedValue(new Error('network error'));
    // Should not throw
    await expect(deadLetter(MOCK_MARKET, new Error('fail'))).resolves.toBeUndefined();
  });
});

// ── runCycle (full pipeline integration) ─────────────────────────────────────

describe('runCycle — full pipeline', () => {
  const expiredMarket = {
    ...MOCK_MARKET,
    end_date: new Date(Date.now() - 5000).toISOString(),
  };

  test('resolves an expired sports market end-to-end', async () => {
    // Backend returns one pending market
    axios.get.mockResolvedValue({ data: { markets: [expiredMarket] } });
    // Log endpoint
    axios.post.mockResolvedValue({ data: {} });

    didTeamWin.mockResolvedValue({ won: true, fixture: {}, team: {} });
    resolveMarketOnChain.mockResolvedValue(MOCK_TX_HASH);

    await runCycle();

    expect(didTeamWin).toHaveBeenCalledWith('Arsenal');
    expect(resolveMarketOnChain).toHaveBeenCalledWith(42, 0);
  });

  test('skips markets that are not yet expired', async () => {
    const futureMarket = {
      ...MOCK_MARKET,
      end_date: new Date(Date.now() + 999999).toISOString(),
    };
    axios.get.mockResolvedValue({ data: { markets: [futureMarket] } });

    await runCycle();

    expect(resolveMarketOnChain).not.toHaveBeenCalled();
  });

  test('dead-letters a market when all retries fail', async () => {
    axios.get.mockResolvedValueOnce({ data: { markets: [expiredMarket] } });
    axios.post.mockResolvedValue({ data: {} });

    didTeamWin.mockRejectedValue(new Error('API down'));

    await runCycle();

    // Dead-letter post should have been called
    const deadLetterCall = axios.post.mock.calls.find(([url]) =>
      url.includes('/api/oracle/dead-letter')
    );
    expect(deadLetterCall).toBeDefined();
  });

  test('handles backend fetch failure gracefully', async () => {
    axios.get.mockRejectedValue(new Error('backend unreachable'));

    // Should not throw
    await expect(runCycle()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  test('processes multiple markets in one cycle', async () => {
    const market2 = { ...expiredMarket, id: 99, question: 'Will Chelsea win the FA Cup?' };
    axios.get.mockResolvedValue({ data: { markets: [expiredMarket, market2] } });
    axios.post.mockResolvedValue({ data: {} });

    didTeamWin.mockResolvedValue({ won: false, fixture: {}, team: {} });
    resolveMarketOnChain.mockResolvedValue(MOCK_TX_HASH);

    await runCycle();

    expect(resolveMarketOnChain).toHaveBeenCalledTimes(2);
    expect(resolveMarketOnChain).toHaveBeenCalledWith(42, 1);
    expect(resolveMarketOnChain).toHaveBeenCalledWith(99, 1);
  });
});
