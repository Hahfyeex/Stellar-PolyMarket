/**
 * Unit tests for market validation middleware
 * Target: >90% code coverage
 */

const { validateMarket, ValidationErrors } = require('../middleware/marketValidation');
const db = require('../db');

// Mock the database and redis modules
jest.mock('../db');
jest.mock('../utils/redis', () => ({
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  on: jest.fn(),
}));

describe('Market Validation', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('validateMarket - Description Length', () => {
    test('should reject market with description shorter than 50 characters', async () => {
      const metadata = {
        question: 'Short question?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('DESCRIPTION_TOO_SHORT');
      expect(result.statusCode).toBe(400);
      expect(result.details.currentLength).toBe(15);
      expect(result.details.requiredLength).toBe(50);
    });

    test('should reject market with null question', async () => {
      const metadata = {
        question: null,
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };
 
      const result = await validateMarket(metadata);
 
      expect(result).not.toBeNull();
      expect(result.code).toBe('DESCRIPTION_TOO_SHORT');
      expect(result.details.currentLength).toBe(0);
    });

    test('should reject market with empty question', async () => {
      const metadata = {
        question: '',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };
 
      const result = await validateMarket(metadata);
 
      expect(result).not.toBeNull();
      expect(result.code).toBe('DESCRIPTION_TOO_SHORT');
      expect(result.details.currentLength).toBe(0);
    });

    test('should reject market with whitespace-only question', async () => {
      const metadata = {
        question: '     ',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };
 
      const result = await validateMarket(metadata);
 
      expect(result).not.toBeNull();
      expect(result.code).toBe('DESCRIPTION_TOO_SHORT');
      expect(result.details.currentLength).toBe(0);
    });

    test('should accept market with exactly 50 characters', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Will this market with exactly fifty characters work?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test('should accept market with more than 50 characters', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Will Bitcoin reach $100,000 by the end of 2026? This is a valid market question.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });
  });

  describe('validateMarket - Outcome Count', () => {
    test('should reject market with less than 2 outcomes', async () => {
      const metadata = {
        question: 'Will this market with only one outcome be accepted by the system?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOME_COUNT');
      expect(result.statusCode).toBe(400);
      expect(result.details.currentCount).toBe(1);
      expect(result.details.requiredRange).toBe('2-5');
    });

    test('should reject market with more than 5 outcomes', async () => {
      const metadata = {
        question: 'Which team will win the championship this year among all teams?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOME_COUNT');
      expect(result.details.currentCount).toBe(6);
    });

    test('should reject market with null outcomes', async () => {
      const metadata = {
        question: 'Will this market with null outcomes be accepted by the system?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: null
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOME_COUNT');
    });

    test('should reject market with empty outcomes array', async () => {
      const metadata = {
        question: 'Will this market with empty outcomes be accepted by the system?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: []
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOME_COUNT');
    });

    test('should accept market with exactly 2 outcomes (binary)', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Will Bitcoin reach $100,000 by the end of 2026? This is a binary market.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test('should accept market with 3 outcomes', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'What will be the outcome of the election in the next cycle?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Candidate A', 'Candidate B', 'Candidate C']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test('should accept market with exactly 5 outcomes', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Which team will win the championship among the top five teams?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Team A', 'Team B', 'Team C', 'Team D', 'Team E']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });
  });

  describe('validateMarket - End Date', () => {
    test('should reject market with end date in the past', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const metadata = {
        question: 'Will this market with a past end date be accepted by the system?',
        endDate: pastDate,
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_END_DATE');
      expect(result.statusCode).toBe(400);
      expect(result.details.providedDate).toBe(pastDate);
    });

    test('should reject market with end date more than 1 year in future', async () => {
      const farFutureDate = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString();
      const metadata = {
        question: 'Will this market with a far future end date be accepted by system?',
        endDate: farFutureDate,
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_END_DATE');
    });

    test('should reject market with invalid date format', async () => {
      const metadata = {
        question: 'Will this market with invalid date format be accepted by system?',
        endDate: 'not-a-valid-date',
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_END_DATE');
    });

    test('should reject market with null end date', async () => {
      const metadata = {
        question: 'Will this market with null end date be accepted by the system?',
        endDate: null,
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_END_DATE');
    });

    test('should accept market with end date 1 day in future', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Will this market with end date tomorrow be accepted by the system?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test('should accept market with end date 6 months in future', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Will this market with end date in six months be accepted by system?',
        endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test('should accept market with end date exactly 1 year in future', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Will this market with end date exactly one year away be accepted?',
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });
  });

  describe('validateMarket - Outcome Labels', () => {
    test('should reject market with empty outcome label', async () => {
      const metadata = {
        question: 'Will Bitcoin reach $100,000 by the end of 2026? This is a valid question with length > 50.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', '']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOMES');
      expect(result.statusCode).toBe(400);
      expect(result.details['outcomes[1]']).toBe('cannot be empty');
    });
 
    test('should reject market with only punctuation/symbols in outcome label', async () => {
      const metadata = {
        question: 'Will Bitcoin reach $100,000 by the end of 2026? This is a valid question with length > 50.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', '!!!']
      };
 
      const result = await validateMarket(metadata);
 
      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOMES');
      expect(result.details['outcomes[1]']).toBe('must contain at least one alphanumeric character');
    });

    test('should reject market with whitespace-only outcome label', async () => {
      const metadata = {
        question: 'Will Bitcoin reach $100,000 by the end of 2026? This is a valid question with length > 50.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', '   ', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOMES');
      expect(result.details['outcomes[1]']).toBe('cannot be empty');
    });

    test('should reject market with duplicate outcome labels (case-insensitive)', async () => {
      const metadata = {
        question: 'Will Bitcoin reach $100,000 by the end of 2026? This is a valid question with length > 50.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No', 'yes']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOMES');
      expect(result.details['outcomes[2]']).toBe('must be unique');
    });

    test('should reject market with too long outcome label (> 100 chars)', async () => {
      const longLabel = 'A'.repeat(101);
      const metadata = {
        question: 'Will Bitcoin reach $100,000 by the end of 2026? This is a valid question with length > 50.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', longLabel]
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOMES');
      expect(result.details['outcomes[1]']).toBe('cannot exceed 100 characters');
    });

    test('should report multiple outcome validation errors', async () => {
      const metadata = {
        question: 'Will Bitcoin reach $100,000 by the end of 2026? This is a valid question with length > 50.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['', 'Yes', 'Yes']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('INVALID_OUTCOMES');
      expect(result.details['outcomes[0]']).toBe('cannot be empty');
      expect(result.details['outcomes[2]']).toBe('must be unique');
    });

    test('should accept valid trimmed outcomes', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Will Bitcoin reach $100,000 by the end of 2026? This is a valid question with length > 50.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['  Yes  ', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });
  });

  describe('validateMarket - Duplicate Check', () => {
    test('should reject market with duplicate question (exact match)', async () => {
      const question = 'Will Bitcoin reach $100,000 by the end of 2026? This is a test market.';
      
      db.query.mockResolvedValue({
        rows: [{ id: 123, question }]
      });

      const metadata = {
        question,
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('DUPLICATE_MARKET');
      expect(result.statusCode).toBe(409);
      expect(result.details.existingMarketId).toBe(123);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(TRIM(question))'),
        [question]
      );
    });

    test('should reject market with duplicate question (case insensitive)', async () => {
      const originalQuestion = 'Will Bitcoin reach $100,000 by the end of 2026? This is a test market.';
      const duplicateQuestion = 'WILL BITCOIN REACH $100,000 BY THE END OF 2026? THIS IS A TEST MARKET.';
      
      db.query.mockResolvedValue({
        rows: [{ id: 456, question: originalQuestion }]
      });

      const metadata = {
        question: duplicateQuestion,
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('DUPLICATE_MARKET');
      expect(result.details.existingMarketId).toBe(456);
    });

    test('should reject market with duplicate question (extra whitespace)', async () => {
      const originalQuestion = 'Will Bitcoin reach $100,000 by the end of 2026? This is a test market.';
      const duplicateQuestion = '  Will Bitcoin reach $100,000 by the end of 2026? This is a test market.  ';
      
      db.query.mockResolvedValue({
        rows: [{ id: 789, question: originalQuestion }]
      });

      const metadata = {
        question: duplicateQuestion,
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe('DUPLICATE_MARKET');
    });

    test('should accept market with unique question', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Will Ethereum reach $10,000 by the end of 2026? This is unique.',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
      expect(db.query).toHaveBeenCalled();
    });

    test('should handle database errors gracefully', async () => {
      db.query.mockRejectedValue(new Error('Database connection failed'));

      const metadata = {
        question: 'Will this market cause a database error during duplicate check?',
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      await expect(validateMarket(metadata)).rejects.toThrow('Database connection failed');
    });
  });

  describe('validateMarket - Complete Valid Market', () => {
    test('should accept completely valid market', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Will the global average temperature increase by more than 1.5°C by 2030?',
        endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        outcomes: ['Yes', 'No']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test('should accept valid multi-choice market', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: 'Which cryptocurrency will have the highest market cap by end of 2026?',
        endDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(),
        outcomes: ['Bitcoin', 'Ethereum', 'Cardano', 'Solana', 'Other']
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });
  });

  describe('ValidationErrors Constants', () => {
    test('should have all required error codes', () => {
      expect(ValidationErrors.DUPLICATE_MARKET).toBeDefined();
      expect(ValidationErrors.INVALID_END_DATE).toBeDefined();
      expect(ValidationErrors.DESCRIPTION_TOO_SHORT).toBeDefined();
      expect(ValidationErrors.INVALID_OUTCOME_COUNT).toBeDefined();
      expect(ValidationErrors.RATE_LIMIT_EXCEEDED).toBeDefined();
      expect(ValidationErrors.MISSING_WALLET_ADDRESS).toBeDefined();
      expect(ValidationErrors.INVALID_OUTCOMES).toBeDefined();
    });

    test('should have correct status codes', () => {
      expect(ValidationErrors.DUPLICATE_MARKET.statusCode).toBe(409);
      expect(ValidationErrors.INVALID_END_DATE.statusCode).toBe(400);
      expect(ValidationErrors.DESCRIPTION_TOO_SHORT.statusCode).toBe(400);
      expect(ValidationErrors.INVALID_OUTCOME_COUNT.statusCode).toBe(400);
      expect(ValidationErrors.RATE_LIMIT_EXCEEDED.statusCode).toBe(429);
      expect(ValidationErrors.MISSING_WALLET_ADDRESS.statusCode).toBe(400);
      expect(ValidationErrors.INVALID_OUTCOMES.statusCode).toBe(400);
    });

    test('should have descriptive error messages', () => {
      expect(ValidationErrors.DUPLICATE_MARKET.message).toContain('exists');
      expect(ValidationErrors.INVALID_END_DATE.message).toContain('future');
      expect(ValidationErrors.DESCRIPTION_TOO_SHORT.message).toContain('50 characters');
      expect(ValidationErrors.INVALID_OUTCOME_COUNT.message).toContain('2 and 5');
      expect(ValidationErrors.INVALID_OUTCOMES.message).toContain('outcomes');
    });
  });

  describe('rateLimitMarketCreation', () => {
    let req, res, next;

    beforeEach(() => {
      const { rateLimitMarketCreation } = require('../middleware/marketValidation');
      req = {
        body: { walletAddress: '0x123' },
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };
      next = jest.fn();
      const redis = require('../utils/redis');
      redis.incr.mockReset();
      redis.expire.mockReset();
      redis.ttl.mockReset();
    });

    test('should pass if within rate limit', async () => {
      const { rateLimitMarketCreation } = require('../middleware/marketValidation');
      const redis = require('../utils/redis');
      redis.incr.mockResolvedValue(1);
      redis.ttl.mockResolvedValue(86400);

      await rateLimitMarketCreation(req, res, next);

      expect(redis.incr).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    test('should reject if rate limit exceeded', async () => {
      const { rateLimitMarketCreation } = require('../middleware/marketValidation');
      const redis = require('../utils/redis');
      redis.incr.mockResolvedValue(4); // limit is 3
      redis.ttl.mockResolvedValue(43200);

      await rateLimitMarketCreation(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle missing wallet address', async () => {
      const { rateLimitMarketCreation } = require('../middleware/marketValidation');
      req.body.walletAddress = null;

      await rateLimitMarketCreation(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('should bypass if redis is unavailable', async () => {
      const { rateLimitMarketCreation } = require('../middleware/marketValidation');
      const redis = require('../utils/redis');
      redis.incr.mockRejectedValue(new Error('Redis down'));

      await rateLimitMarketCreation(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('validateMarketCreation', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        body: {
          question: 'Valid question with at least 50 characters for the market creation test.',
          endDate: new Date(Date.now() + 86400000).toISOString(),
          outcomes: ['Yes', 'No'],
        },
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      next = jest.fn();
    });

    test('should trim outcomes and pass validation', async () => {
      const { validateMarketCreation } = require('../middleware/marketValidation');
      db.query.mockResolvedValue({ rows: [] });
      req.body.outcomes = ['  Yes  ', 'No '];

      await validateMarketCreation(req, res, next);

      expect(req.body.outcomes).toEqual(['Yes', 'No']);
      expect(next).toHaveBeenCalled();
    });

    test('should reject if metadata validation fails', async () => {
      const { validateMarketCreation } = require('../middleware/marketValidation');
      req.body.question = 'Short';

      await validateMarketCreation(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });
 
    test('should reject if outcomes is missing (branch coverage)', async () => {
      const { validateMarketCreation } = require('../middleware/marketValidation');
      req.body.outcomes = null;
 
      await validateMarketCreation(req, res, next);
 
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'INVALID_OUTCOME_COUNT' })
      }));
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle unexpected errors during validation', async () => {
      const { validateMarketCreation } = require('../middleware/marketValidation');
      db.query.mockRejectedValue(new Error('Pool error'));

      await validateMarketCreation(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
