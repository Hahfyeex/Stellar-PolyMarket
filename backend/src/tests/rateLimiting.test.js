/**
 * Integration tests for rate limiting middleware
 * Tests Redis-based rate limiting for market creation
 */

const { rateLimitMarketCreation, ValidationErrors } = require('../middleware/marketValidation');
const redis = require('../utils/redis');

// Mock Redis
jest.mock('../utils/redis', () => ({
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
}));

describe('Rate Limiting Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock Express request, response, and next
    req = {
      body: {
        walletAddress: 'GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();
  });

  describe('First Market Creation', () => {
    test('should allow first market creation and set TTL', async () => {
      redis.incr.mockResolvedValue(1);
      redis.ttl.mockResolvedValue(86400);

      await rateLimitMarketCreation(req, res, next);

      expect(redis.incr).toHaveBeenCalledWith('rate_limit:create:GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(redis.expire).toHaveBeenCalledWith('rate_limit:create:GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ', 86400);
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '3');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '2');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('Second Market Creation', () => {
    test('should allow second market creation without setting TTL', async () => {
      redis.incr.mockResolvedValue(2);
      redis.ttl.mockResolvedValue(82800); // 23 hours remaining

      await rateLimitMarketCreation(req, res, next);

      expect(redis.incr).toHaveBeenCalled();
      expect(redis.expire).not.toHaveBeenCalled(); // TTL not set on second call
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Third Market Creation', () => {
    test('should allow third market creation (at limit)', async () => {
      redis.incr.mockResolvedValue(3);
      redis.ttl.mockResolvedValue(79200); // 22 hours remaining

      await rateLimitMarketCreation(req, res, next);

      expect(redis.incr).toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('Fourth Market Creation (Rate Limit Exceeded)', () => {
    test('should block fourth market creation with 429 status', async () => {
      redis.incr.mockResolvedValue(4);
      redis.ttl.mockResolvedValue(75600); // 21 hours remaining

      await rateLimitMarketCreation(req, res, next);

      expect(redis.incr).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.set).toHaveBeenCalledWith('Retry-After', '75600');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '3');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      expect(res.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
          details: expect.objectContaining({
            limit: 3,
            windowSeconds: 86400,
            retryAfterSeconds: 75600
          })
        })
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should include correct reset timestamp in response', async () => {
      const ttl = 75600;
      const now = Date.now();
      redis.incr.mockResolvedValue(4);
      redis.ttl.mockResolvedValue(ttl);

      await rateLimitMarketCreation(req, res, next);

      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      
      const resetCall = res.set.mock.calls.find(call => call[0] === 'X-RateLimit-Reset');
      const resetTimestamp = parseInt(resetCall[1]);
      
      // Reset timestamp should be approximately now + ttl
      expect(resetTimestamp).toBeGreaterThan(now);
      expect(resetTimestamp).toBeLessThan(now + ttl * 1000 + 1000); // Allow 1s tolerance
    });
  });

  describe('Missing Wallet Address', () => {
    test('should reject request without wallet address', async () => {
      req.body.walletAddress = undefined;

      await rateLimitMarketCreation(req, res, next);

      expect(redis.incr).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: ValidationErrors.MISSING_WALLET_ADDRESS
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject request with null wallet address', async () => {
      req.body.walletAddress = null;

      await rateLimitMarketCreation(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject request with empty wallet address', async () => {
      req.body.walletAddress = '';

      await rateLimitMarketCreation(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Redis Error Handling', () => {
    test('should allow request if Redis is unavailable', async () => {
      redis.incr.mockRejectedValue(new Error('Redis connection failed'));

      await rateLimitMarketCreation(req, res, next);

      expect(redis.incr).toHaveBeenCalled();
      expect(next).toHaveBeenCalled(); // Request proceeds despite Redis error
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should handle Redis timeout gracefully', async () => {
      redis.incr.mockRejectedValue(new Error('Command timed out'));

      await rateLimitMarketCreation(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Different Wallet Addresses', () => {
    test('should track rate limits separately per wallet', async () => {
      const wallet1 = 'GWALLET1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const wallet2 = 'GWALLET9876543210ZYXWVUTSRQPONMLKJIHGFEDCBA';

      // First wallet - first creation
      req.body.walletAddress = wallet1;
      redis.incr.mockResolvedValue(1);
      redis.ttl.mockResolvedValue(86400);

      await rateLimitMarketCreation(req, res, next);

      expect(redis.incr).toHaveBeenCalledWith(`rate_limit:create:${wallet1}`);
      expect(next).toHaveBeenCalled();

      // Reset mocks
      jest.clearAllMocks();

      // Second wallet - first creation (should also be allowed)
      req.body.walletAddress = wallet2;
      redis.incr.mockResolvedValue(1);
      redis.ttl.mockResolvedValue(86400);

      await rateLimitMarketCreation(req, res, next);

      expect(redis.incr).toHaveBeenCalledWith(`rate_limit:create:${wallet2}`);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Rate Limit Headers', () => {
    test('should include all required rate limit headers', async () => {
      redis.incr.mockResolvedValue(2);
      redis.ttl.mockResolvedValue(82800);

      await rateLimitMarketCreation(req, res, next);

      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '3');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    test('should set Retry-After header when rate limit exceeded', async () => {
      redis.incr.mockResolvedValue(5);
      redis.ttl.mockResolvedValue(60000);

      await rateLimitMarketCreation(req, res, next);

      expect(res.set).toHaveBeenCalledWith('Retry-After', '60000');
    });
  });

  describe('24 Hour Window', () => {
    test('should use 86400 seconds (24 hours) as window', async () => {
      redis.incr.mockResolvedValue(1);
      redis.ttl.mockResolvedValue(86400);

      await rateLimitMarketCreation(req, res, next);

      expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 86400);
    });

    test('should include window duration in error response', async () => {
      redis.incr.mockResolvedValue(4);
      redis.ttl.mockResolvedValue(50000);

      await rateLimitMarketCreation(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          details: expect.objectContaining({
            windowSeconds: 86400
          })
        })
      });
    });
  });
});
