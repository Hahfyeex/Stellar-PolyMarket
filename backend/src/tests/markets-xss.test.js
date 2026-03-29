/**
 * POST /api/markets — ensure market question is sanitized before storage (stored XSS).
 */

const request = require("supertest");
const express = require("express");
const sanitizeHtml = require("sanitize-html");

jest.mock("../middleware/marketValidation", () => ({
  validateMarketCreation: (req, res, next) => next(),
  rateLimitMarketCreation: (req, res, next) => next(),
}));

jest.mock("../db");

jest.mock("../bots/eventBus", () => ({
  emit: jest.fn(),
}));

jest.mock("../utils/redis", () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const db = require("../db");
const eventBus = require("../bots/eventBus");
const marketsRouter = require("../routes/markets");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'");
    next();
  });
  app.use("/api/markets", marketsRouter);
  return app;
}

describe("POST /api/markets — question XSS sanitization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("strips script tags and HTML from question before database insert", async () => {
    const endDate = new Date(Date.now() + 86400000).toISOString();
    const plainSuffix =
      " Will Bitcoin reach one hundred thousand dollars by end of 2026? Extra text for min length.";
    const malicious = `<script>alert('xss')</script><img src=x onerror=alert(1)>${plainSuffix}`;

    const expectedStored = sanitizeHtml(malicious, {
      allowedTags: [],
      allowedAttributes: {},
    }).trim();

    expect(expectedStored).not.toMatch(/<script/i);
    expect(expectedStored).not.toMatch(/onerror/i);

    const inserted = {
      id: 42,
      question: expectedStored,
      end_date: endDate,
      outcomes: ["Yes", "No"],
      contract_address: null,
      created_at: new Date().toISOString(),
    };

    db.query.mockResolvedValueOnce({ rows: [inserted] });

    const app = buildApp();
    const res = await request(app)
      .post("/api/markets")
      .send({
        question: malicious,
        endDate,
        outcomes: ["Yes", "No"],
        walletAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      });

    expect(res.status).toBe(201);
    expect(res.headers["content-security-policy"]).toBe("default-src 'self'");
    expect(res.body.market.question).toBe(expectedStored);

    const insertCall = db.query.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO markets")
    );
    expect(insertCall).toBeDefined();
    expect(insertCall[1][0]).toBe(expectedStored);

    expect(eventBus.emit).toHaveBeenCalledWith(
      "market.created",
      expect.objectContaining({ question: expectedStored })
    );
  });
});
