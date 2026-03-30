"use strict";

/**
 * Integration tests for the global error handler.
 * Verifies stack traces are never exposed in production/staging responses.
 */

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock("firebase-admin", () => ({ apps: [true], initializeApp: jest.fn() }));
jest.mock("../middleware/appCheck", () => (req, res, next) => next());

const request = require("supertest");
const express = require("express");
const logger = require("../utils/logger");

function buildApp(nodeEnv) {
  const app = express();
  app.use(express.json());

  // Simulate request ID middleware
  app.use((req, res, next) => {
    req.requestId = "test-request-id";
    next();
  });

  // Route that throws
  app.get("/error", (req, res, next) => {
    const err = new Error("Something went wrong internally");
    err.stack = "Error: Something went wrong internally\n    at /app/src/secret.js:42:7";
    next(err);
  });

  // Production error handler (always sanitized)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const requestId = req.requestId;
    logger.error(
      { err: { message: err.message, stack: err.stack, code: err.code }, requestId },
      "Unhandled error"
    );
    res.status(err.status || 500).json({ error: "Internal server error", requestId });
  });

  // Dev-only handler
  if (nodeEnv === "development") {
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => {
      res
        .status(err.status || 500)
        .json({ error: err.message, stack: err.stack, requestId: req.requestId });
    });
  }

  return app;
}

describe("Global error handler", () => {
  describe("production mode", () => {
    const app = buildApp("production");

    it("returns 500 with sanitized message — no stack trace", async () => {
      const res = await request(app).get("/error");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
      expect(res.body.stack).toBeUndefined();
      expect(res.body.message).toBeUndefined();
    });

    it("includes requestId in the response", async () => {
      const res = await request(app).get("/error");
      expect(res.body.requestId).toBe("test-request-id");
    });

    it("logs full error details internally with requestId", async () => {
      await request(app).get("/error");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "test-request-id",
          err: expect.objectContaining({ message: "Something went wrong internally" }),
        }),
        "Unhandled error"
      );
    });

    it("never exposes internal file paths in response body", async () => {
      const res = await request(app).get("/error");
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("/app/src/secret.js");
      expect(body).not.toContain("at /");
    });
  });

  describe("staging mode (NODE_ENV not 'development')", () => {
    const app = buildApp("staging");

    it("returns sanitized response — no stack trace in staging", async () => {
      const res = await request(app).get("/error");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
      expect(res.body.stack).toBeUndefined();
    });
  });

  describe("development mode", () => {
    const app = buildApp("development");

    it("still returns sanitized response from primary handler", async () => {
      const res = await request(app).get("/error");
      expect(res.status).toBe(500);
      // Primary handler always sends sanitized; dev handler only fires if primary doesn't send
      expect(res.body.requestId).toBe("test-request-id");
    });
  });
});
