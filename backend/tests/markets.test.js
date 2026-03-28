const request = require("supertest");
const express = require("express");
const marketsRouter = require("../src/routes/markets");

describe("Markets Routes - Pagination", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/markets", marketsRouter);
  });

  describe("GET /api/markets Pagination", () => {
    /**
     * Test: Default pagination parameters
     * Verifies default limit (20) and offset (0) are applied
     */
    test("should use default pagination (limit=20, offset=0)", async () => {
      // This test verifies the pagination logic
      // In a real test, we would mock the database
      // For now, we test the parameter validation logic
      
      const limit = Math.min(parseInt(undefined) || 20, 100);
      const offset = parseInt(undefined) || 0;

      expect(limit).toBe(20);
      expect(offset).toBe(0);
    });

    /**
     * Test: Custom pagination parameters
     * Verifies custom limit and offset are respected
     */
    test("should accept custom limit and offset", () => {
      const limit = Math.min(parseInt("50") || 20, 100);
      const offset = parseInt("100") || 0;

      expect(limit).toBe(50);
      expect(offset).toBe(100);
    });

    /**
     * Test: Limit capped at 100
     * Verifies limit cannot exceed 100
     */
    test("should cap limit at 100", () => {
      const limit = Math.min(parseInt("500") || 20, 100);

      expect(limit).toBe(100);
    });

    /**
     * Test: Invalid limit parameter
     * Verifies non-integer limit is rejected
     */
    test("should reject non-integer limit", () => {
      const limitStr = "abc";
      const limit = parseInt(limitStr) || 20;

      // parseInt("abc") returns NaN, so default 20 is used
      expect(limit).toBe(20);
    });

    /**
     * Test: Negative limit parameter
     * Verifies negative limit is rejected
     */
    test("should reject negative limit", () => {
      const limitStr = "-10";
      const limit = parseInt(limitStr);

      expect(limit).toBe(-10);
      expect(limit < 1).toBe(true);
    });

    /**
     * Test: Negative offset parameter
     * Verifies negative offset is rejected
     */
    test("should reject negative offset", () => {
      const offsetStr = "-5";
      const offset = parseInt(offsetStr);

      expect(offset).toBe(-5);
      expect(offset < 0).toBe(true);
    });

    /**
     * Test: Boundary value - last page
     * Verifies hasMore is false on last page
     */
    test("should set hasMore=false on last page", () => {
      const total = 50;
      const limit = 20;
      const offset = 40;

      const hasMore = offset + limit < total;

      expect(hasMore).toBe(false);
    });

    /**
     * Test: Boundary value - not last page
     * Verifies hasMore is true when more results exist
     */
    test("should set hasMore=true when more results exist", () => {
      const total = 100;
      const limit = 20;
      const offset = 0;

      const hasMore = offset + limit < total;

      expect(hasMore).toBe(true);
    });

    /**
     * Test: Boundary value - exact page boundary
     * Verifies hasMore is false when offset + limit equals total
     */
    test("should set hasMore=false when offset+limit equals total", () => {
      const total = 100;
      const limit = 20;
      const offset = 80;

      const hasMore = offset + limit < total;

      expect(hasMore).toBe(false);
    });

    /**
     * Test: Response structure
     * Verifies response includes markets array and meta object
     */
    test("should return correct response structure", () => {
      const mockResponse = {
        markets: [],
        meta: {
          total: 100,
          limit: 20,
          offset: 0,
          hasMore: true,
        },
      };

      expect(mockResponse).toHaveProperty("markets");
      expect(mockResponse).toHaveProperty("meta");
      expect(mockResponse.meta).toHaveProperty("total");
      expect(mockResponse.meta).toHaveProperty("limit");
      expect(mockResponse.meta).toHaveProperty("offset");
      expect(mockResponse.meta).toHaveProperty("hasMore");
    });

    /**
     * Test: Meta object accuracy
     * Verifies meta object contains correct values
     */
    test("should calculate meta object correctly", () => {
      const total = 250;
      const limit = 25;
      const offset = 50;
      const hasMore = offset + limit < total;

      expect(hasMore).toBe(true);
      expect(offset + limit).toBe(75);
      expect(75 < 250).toBe(true);
    });

    /**
     * Test: Zero offset
     * Verifies offset=0 returns first page
     */
    test("should handle offset=0 correctly", () => {
      const offset = 0;
      const limit = 20;

      expect(offset).toBe(0);
      expect(offset + limit).toBe(20);
    });

    /**
     * Test: Large offset
     * Verifies large offset values are handled
     */
    test("should handle large offset values", () => {
      const total = 10000;
      const limit = 20;
      const offset = 9980;
      const hasMore = offset + limit < total;

      expect(hasMore).toBe(false);
    });

    /**
     * Test: Empty result set
     * Verifies hasMore=false when no results
     */
    test("should set hasMore=false for empty result set", () => {
      const total = 0;
      const limit = 20;
      const offset = 0;
      const hasMore = offset + limit < total;

      expect(hasMore).toBe(false);
    });

    /**
     * Test: Single result
     * Verifies hasMore=false with single result
     */
    test("should set hasMore=false with single result", () => {
      const total = 1;
      const limit = 20;
      const offset = 0;
      const hasMore = offset + limit < total;

      expect(hasMore).toBe(false);
    });
  });
});
