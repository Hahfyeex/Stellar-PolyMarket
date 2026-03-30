/**
 * Market Validation Middleware
 * Implements automated validation for permissionless market creation
 *
 * Validation Rules:
 * 1. No duplicate markets (same question)
 * 2. Valid end date (must be in the future, max 1 year)
 * 3. Description length (minimum 50 characters)
 * 4. Outcome count (between 2 and 5 outcomes)
 */

const db = require("../db");
const redis = require("../utils/redis");
const logger = require("../utils/logger");

// Error codes for specific validation failures
const ValidationErrors = {
  DUPLICATE_MARKET: {
    code: "DUPLICATE_MARKET",
    message: "A market with this question already exists",
    statusCode: 409,
  },
  INVALID_END_DATE: {
    code: "INVALID_END_DATE",
    message: "End date must be at least 1 hour in the future and within 1 year",
    statusCode: 400,
  },
  DESCRIPTION_TOO_SHORT: {
    code: "DESCRIPTION_TOO_SHORT",
    message: "Market question must be at least 50 characters long",
    statusCode: 400,
  },
  INVALID_OUTCOME_COUNT: {
    code: "INVALID_OUTCOME_COUNT",
    message: "Market must have between 2 and 5 outcomes",
    statusCode: 400,
  },
  RATE_LIMIT_EXCEEDED: {
    code: "RATE_LIMIT_EXCEEDED",
    message: "Rate limit exceeded. Maximum 3 markets per wallet per 24 hours",
    statusCode: 429,
  },
  MISSING_WALLET_ADDRESS: {
    code: "MISSING_WALLET_ADDRESS",
    message: "Wallet address is required for market creation",
    statusCode: 400,
  },
  INVALID_OUTCOMES: {
    code: "INVALID_OUTCOMES",
    message: "Validation failed for one or more outcomes",
    statusCode: 400,
  },
};

/**
 * Validate market metadata
 * @param {Object} metadata - Market metadata to validate
 * @param {string} metadata.question - Market question
 * @param {string} metadata.endDate - Market end date (ISO 8601)
 * @param {Array<string>} metadata.outcomes - Market outcomes
 * @returns {Object|null} - Validation error or null if valid
 */
async function validateMarket(metadata) {
  const { question, endDate, outcomes } = metadata;

  // Validation 1: Check description length (minimum 50 characters)
  // This ensures markets have sufficient context for users to make informed decisions
  if (!question || question.trim().length < 50) {
    logger.warn(
      {
        question_length: question?.length || 0,
        validation: "DESCRIPTION_TOO_SHORT",
      },
      "Market validation failed: description too short"
    );

    return {
      ...ValidationErrors.DESCRIPTION_TOO_SHORT,
      details: {
        currentLength: question?.length || 0,
        requiredLength: 50,
      },
    };
  }

  // Validation 2: Check outcome count (must be between 2 and 5)
  // Binary markets (2 outcomes) and multi-choice markets (3-5 outcomes) are supported
  if (!outcomes || !Array.isArray(outcomes) || outcomes.length < 2 || outcomes.length > 5) {
    logger.warn(
      {
        outcome_count: outcomes?.length || 0,
        validation: "INVALID_OUTCOME_COUNT",
      },
      "Market validation failed: invalid outcome count"
    );

    return {
      ...ValidationErrors.INVALID_OUTCOME_COUNT,
      details: {
        currentCount: outcomes?.length || 0,
        requiredRange: "2-5",
      },
    };
  }

  // Validation 3: Check end date validity
  // End date must be at least 1 hour in the future but not more than 1 year ahead
  const now = new Date();
  const endDateTime = new Date(endDate);
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  if (
    isNaN(endDateTime.getTime()) ||
    endDateTime <= now ||
    endDateTime < oneHourFromNow ||
    endDateTime > oneYearFromNow
  ) {
    logger.warn(
      {
        end_date: endDate,
        parsed_date: isNaN(endDateTime.getTime()) ? "Invalid Date" : endDateTime.toISOString(),
        validation: "INVALID_END_DATE",
      },
      "Market validation failed: invalid end date"
    );

    return {
      ...ValidationErrors.INVALID_END_DATE,
      details: {
        providedDate: endDate,
        minimumDate: oneHourFromNow.toISOString(),
        maximumDate: oneYearFromNow.toISOString(),
      },
    };
  }

  // Validation 4: Check individual outcome labels
  // Labels must be non-empty, unique (case-insensitive), and max 100 characters
  const outcomeErrors = {};
  const seenLabels = new Set();

  if (Array.isArray(outcomes)) {
    outcomes.forEach((label, index) => {
      // Note: Labels are trimmed in the calling middleware, but we safeguard here
      const trimmedLabel = typeof label === "string" ? label.trim() : "";

      if (!trimmedLabel) {
        outcomeErrors[`outcomes[${index}]`] = "cannot be empty";
      } else if (trimmedLabel.length > 100) {
        outcomeErrors[`outcomes[${index}]`] = "cannot exceed 100 characters";
      }

      const lowerLabel = trimmedLabel.toLowerCase();
      if (trimmedLabel && seenLabels.has(lowerLabel)) {
        outcomeErrors[`outcomes[${index}]`] = "must be unique";
      }
      if (trimmedLabel) seenLabels.add(lowerLabel);
    });
  }

  if (Object.keys(outcomeErrors).length > 0) {
    logger.warn(
      {
        outcome_errors: outcomeErrors,
        validation: "INVALID_OUTCOMES",
      },
      "Market validation failed: invalid outcomes"
    );

    return {
      ...ValidationErrors.INVALID_OUTCOMES,
      details: outcomeErrors,
    };
  }

  // Validation 5: Check for duplicate markets
  // Prevent creation of markets with identical questions (case-insensitive)
  try {
    const duplicateCheck = await db.query(
      "SELECT id, question FROM markets WHERE LOWER(TRIM(question)) = LOWER(TRIM($1))",
      [question]
    );

    if (duplicateCheck.rows.length > 0) {
      logger.warn(
        {
          question,
          existing_market_id: duplicateCheck.rows[0].id,
          validation: "DUPLICATE_MARKET",
        },
        "Market validation failed: duplicate market"
      );

      return {
        ...ValidationErrors.DUPLICATE_MARKET,
        details: {
          existingMarketId: duplicateCheck.rows[0].id,
          existingQuestion: duplicateCheck.rows[0].question,
        },
      };
    }
  } catch (err) {
    logger.error({ err, question }, "Error checking for duplicate markets");
    throw err;
  }

  // All validations passed
  logger.debug({ question, outcomes_count: outcomes.length }, "Market validation passed");
  return null;
}

/**
 * Rate limiting middleware for market creation
 * Limits each wallet to 3 market creations per 24 hours
 * Uses Redis INCR with TTL for efficient rate limiting
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function rateLimitMarketCreation(req, res, next) {
  const { walletAddress } = req.body;

  // Wallet address is required for rate limiting
  if (!walletAddress) {
    logger.warn(
      { validation: "MISSING_WALLET_ADDRESS" },
      "Market creation failed: missing wallet address"
    );
    return res.status(ValidationErrors.MISSING_WALLET_ADDRESS.statusCode).json({
      error: ValidationErrors.MISSING_WALLET_ADDRESS,
    });
  }

  const rateLimitKey = `rate_limit:create:${walletAddress}`;
  const maxCreations = 3;
  const windowSeconds = 86400; // 24 hours

  try {
    // Increment the counter for this wallet
    const currentCount = await redis.incr(rateLimitKey);

    // Set TTL on first creation (when count is 1)
    if (currentCount === 1) {
      await redis.expire(rateLimitKey, windowSeconds);
    }

    // Get TTL to calculate retry-after header
    const ttl = await redis.ttl(rateLimitKey);

    // Check if rate limit is exceeded
    if (currentCount > maxCreations) {
      logger.warn(
        {
          wallet_address: walletAddress,
          current_count: currentCount,
          max_creations: maxCreations,
          ttl_seconds: ttl,
          validation: "RATE_LIMIT_EXCEEDED",
        },
        "Market creation rate limit exceeded"
      );

      return res
        .status(ValidationErrors.RATE_LIMIT_EXCEEDED.statusCode)
        .set("Retry-After", ttl.toString())
        .set("X-RateLimit-Limit", maxCreations.toString())
        .set("X-RateLimit-Remaining", "0")
        .set("X-RateLimit-Reset", (Date.now() + ttl * 1000).toString())
        .json({
          error: {
            ...ValidationErrors.RATE_LIMIT_EXCEEDED,
            details: {
              limit: maxCreations,
              windowSeconds: windowSeconds,
              retryAfterSeconds: ttl,
              resetAt: new Date(Date.now() + ttl * 1000).toISOString(),
            },
          },
        });
    }

    // Add rate limit headers to response
    res.set("X-RateLimit-Limit", maxCreations.toString());
    res.set("X-RateLimit-Remaining", Math.max(0, maxCreations - currentCount).toString());
    res.set("X-RateLimit-Reset", (Date.now() + ttl * 1000).toString());

    logger.debug(
      {
        wallet_address: walletAddress,
        current_count: currentCount,
        remaining: maxCreations - currentCount,
      },
      "Rate limit check passed"
    );

    next();
  } catch (err) {
    logger.error({ err, wallet_address: walletAddress }, "Error checking rate limit");

    // If Redis is unavailable, allow the request but log the error
    // This prevents Redis outages from blocking all market creation
    logger.warn("Redis unavailable, bypassing rate limit check");
    next();
  }
}

/**
 * Combined validation middleware
 * Validates market metadata and enforces rate limiting
 */
async function validateMarketCreation(req, res, next) {
  // Trim outcome labels before validation and storage
  if (Array.isArray(req.body.outcomes)) {
    req.body.outcomes = req.body.outcomes.map((o) => (typeof o === "string" ? o.trim() : o));
  }

  const { question, endDate, outcomes } = req.body;

  try {
    // Run metadata validation
    const validationError = await validateMarket({ question, endDate, outcomes });

    if (validationError) {
      return res.status(validationError.statusCode).json({
        error: validationError,
      });
    }

    // Validation passed, proceed to next middleware (rate limiting)
    next();
  } catch (err) {
    logger.error({ err, question }, "Error during market validation");
    res.status(500).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "An error occurred during market validation",
        details: err.message,
      },
    });
  }
}

module.exports = {
  validateMarket,
  rateLimitMarketCreation,
  validateMarketCreation,
  ValidationErrors,
};
