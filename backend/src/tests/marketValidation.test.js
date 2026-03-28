/**
 * Unit tests for market validation middleware
 * Target: >90% code coverage
 */

const { validateMarket, ValidationErrors } = require("../middleware/marketValidation");
const db = require("../db");

// Mock the database module
jest.mock("../db");

describe("Market Validation", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("validateMarket - Description Length", () => {
    test("should reject market with description shorter than 50 characters", async () => {
      const metadata = {
        question: "Short question?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("DESCRIPTION_TOO_SHORT");
      expect(result.statusCode).toBe(400);
      expect(result.details.currentLength).toBe(15);
      expect(result.details.requiredLength).toBe(50);
    });

    test("should reject market with null question", async () => {
      const metadata = {
        question: null,
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("DESCRIPTION_TOO_SHORT");
    });

    test("should reject market with empty question", async () => {
      const metadata = {
        question: "",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("DESCRIPTION_TOO_SHORT");
    });

    test("should reject market with whitespace-only question", async () => {
      const metadata = {
        question: "     ",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("DESCRIPTION_TOO_SHORT");
    });

    test("should accept market with exactly 50 characters", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "Will this market with exactly fifty characters work?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test("should accept market with more than 50 characters", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question:
          "Will Bitcoin reach $100,000 by the end of 2026? This is a valid market question.",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });
  });

  describe("validateMarket - Outcome Count", () => {
    test("should reject market with less than 2 outcomes", async () => {
      const metadata = {
        question: "Will this market with only one outcome be accepted by the system?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("INVALID_OUTCOME_COUNT");
      expect(result.statusCode).toBe(400);
      expect(result.details.currentCount).toBe(1);
      expect(result.details.requiredRange).toBe("2-5");
    });

    test("should reject market with more than 5 outcomes", async () => {
      const metadata = {
        question: "Which team will win the championship this year among all teams?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Team A", "Team B", "Team C", "Team D", "Team E", "Team F"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("INVALID_OUTCOME_COUNT");
      expect(result.details.currentCount).toBe(6);
    });

    test("should reject market with null outcomes", async () => {
      const metadata = {
        question: "Will this market with null outcomes be accepted by the system?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: null,
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("INVALID_OUTCOME_COUNT");
    });

    test("should reject market with empty outcomes array", async () => {
      const metadata = {
        question: "Will this market with empty outcomes be accepted by the system?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: [],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("INVALID_OUTCOME_COUNT");
    });

    test("should accept market with exactly 2 outcomes (binary)", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "Will Bitcoin reach $100,000 by the end of 2026? This is a binary market.",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test("should accept market with 3 outcomes", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "What will be the outcome of the election in the next cycle?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Candidate A", "Candidate B", "Candidate C"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test("should accept market with exactly 5 outcomes", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "Which team will win the championship among the top five teams?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Team A", "Team B", "Team C", "Team D", "Team E"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });
  });

  describe("validateMarket - End Date", () => {
    test("should reject market with end date in the past", async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const metadata = {
        question: "Will this market with a past end date be accepted by the system?",
        endDate: pastDate,
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("END_DATE_IN_PAST");
      expect(result.statusCode).toBe(400);
      expect(result.details.providedDate).toBe(pastDate);
    });

    test("should reject market with end date less than 1 hour in the future", async () => {
      const tooSoonDate = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
      const metadata = {
        question: "Will this market with an end date under one hour be accepted by system?",
        endDate: tooSoonDate,
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("END_DATE_TOO_SOON");
      expect(result.statusCode).toBe(400);
    });

    test("should reject market with end date more than 1 year in future", async () => {
      const farFutureDate = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString();
      const metadata = {
        question: "Will this market with a far future end date be accepted by system?",
        endDate: farFutureDate,
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("END_DATE_TOO_FAR");
      expect(result.statusCode).toBe(400);
    });

    test("should reject market with invalid date format", async () => {
      const metadata = {
        question: "Will this market with invalid date format be accepted by system?",
        endDate: "not-a-valid-date",
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("END_DATE_IN_PAST");
    });

    test("should reject market with null end date", async () => {
      const metadata = {
        question: "Will this market with null end date be accepted by the system?",
        endDate: null,
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("END_DATE_IN_PAST");
    });

    test("should accept market with end date 1 day in future", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "Will this market with end date tomorrow be accepted by the system?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test("should accept market with end date 6 months in future", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "Will this market with end date in six months be accepted by system?",
        endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test("should accept market with end date exactly 1 year in future", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "Will this market with end date exactly one year away be accepted?",
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });
  });

  describe("validateMarket - Duplicate Check", () => {
    test("should reject market with duplicate question (exact match)", async () => {
      const question = "Will Bitcoin reach $100,000 by the end of 2026? This is a test market.";

      db.query.mockResolvedValue({
        rows: [{ id: 123, question }],
      });

      const metadata = {
        question,
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("DUPLICATE_MARKET");
      expect(result.statusCode).toBe(409);
      expect(result.details.existingMarketId).toBe(123);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining("LOWER(TRIM(question))"), [
        question,
      ]);
    });

    test("should reject market with duplicate question (case insensitive)", async () => {
      const originalQuestion =
        "Will Bitcoin reach $100,000 by the end of 2026? This is a test market.";
      const duplicateQuestion =
        "WILL BITCOIN REACH $100,000 BY THE END OF 2026? THIS IS A TEST MARKET.";

      db.query.mockResolvedValue({
        rows: [{ id: 456, question: originalQuestion }],
      });

      const metadata = {
        question: duplicateQuestion,
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("DUPLICATE_MARKET");
      expect(result.details.existingMarketId).toBe(456);
    });

    test("should reject market with duplicate question (extra whitespace)", async () => {
      const originalQuestion =
        "Will Bitcoin reach $100,000 by the end of 2026? This is a test market.";
      const duplicateQuestion =
        "  Will Bitcoin reach $100,000 by the end of 2026? This is a test market.  ";

      db.query.mockResolvedValue({
        rows: [{ id: 789, question: originalQuestion }],
      });

      const metadata = {
        question: duplicateQuestion,
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).not.toBeNull();
      expect(result.code).toBe("DUPLICATE_MARKET");
    });

    test("should accept market with unique question", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "Will Ethereum reach $10,000 by the end of 2026? This is unique.",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
      expect(db.query).toHaveBeenCalled();
    });

    test("should handle database errors gracefully", async () => {
      db.query.mockRejectedValue(new Error("Database connection failed"));

      const metadata = {
        question: "Will this market cause a database error during duplicate check?",
        endDate: new Date(Date.now() + 86400000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      await expect(validateMarket(metadata)).rejects.toThrow("Database connection failed");
    });
  });

  describe("validateMarket - Complete Valid Market", () => {
    test("should accept completely valid market", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "Will the global average temperature increase by more than 1.5°C by 2030?",
        endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        outcomes: ["Yes", "No"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });

    test("should accept valid multi-choice market", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const metadata = {
        question: "Which cryptocurrency will have the highest market cap by end of 2026?",
        endDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(),
        outcomes: ["Bitcoin", "Ethereum", "Cardano", "Solana", "Other"],
      };

      const result = await validateMarket(metadata);

      expect(result).toBeNull();
    });
  });

  describe("ValidationErrors Constants", () => {
    test("should have all required error codes", () => {
      expect(ValidationErrors.DUPLICATE_MARKET).toBeDefined();
      expect(ValidationErrors.INVALID_END_DATE).toBeDefined();
      expect(ValidationErrors.END_DATE_IN_PAST).toBeDefined();
      expect(ValidationErrors.END_DATE_TOO_SOON).toBeDefined();
      expect(ValidationErrors.END_DATE_TOO_FAR).toBeDefined();
      expect(ValidationErrors.DESCRIPTION_TOO_SHORT).toBeDefined();
      expect(ValidationErrors.INVALID_OUTCOME_COUNT).toBeDefined();
      expect(ValidationErrors.RATE_LIMIT_EXCEEDED).toBeDefined();
      expect(ValidationErrors.MISSING_WALLET_ADDRESS).toBeDefined();
    });

    test("should have correct status codes", () => {
      expect(ValidationErrors.DUPLICATE_MARKET.statusCode).toBe(409);
      expect(ValidationErrors.INVALID_END_DATE.statusCode).toBe(400);
      expect(ValidationErrors.END_DATE_IN_PAST.statusCode).toBe(400);
      expect(ValidationErrors.END_DATE_TOO_SOON.statusCode).toBe(400);
      expect(ValidationErrors.END_DATE_TOO_FAR.statusCode).toBe(400);
      expect(ValidationErrors.DESCRIPTION_TOO_SHORT.statusCode).toBe(400);
      expect(ValidationErrors.INVALID_OUTCOME_COUNT.statusCode).toBe(400);
      expect(ValidationErrors.RATE_LIMIT_EXCEEDED.statusCode).toBe(429);
      expect(ValidationErrors.MISSING_WALLET_ADDRESS.statusCode).toBe(400);
    });

    test("should have descriptive error messages", () => {
      expect(ValidationErrors.DUPLICATE_MARKET.message).toContain("already exists");
      expect(ValidationErrors.END_DATE_IN_PAST.message).toContain("future");
      expect(ValidationErrors.END_DATE_TOO_SOON.message).toContain("1 hour");
      expect(ValidationErrors.END_DATE_TOO_FAR.message).toContain("1 year");
      expect(ValidationErrors.DESCRIPTION_TOO_SHORT.message).toContain("50 characters");
      expect(ValidationErrors.INVALID_OUTCOME_COUNT.message).toContain("2 and 5");
      expect(ValidationErrors.RATE_LIMIT_EXCEEDED.message).toContain("3 markets");
    });
  });
});
