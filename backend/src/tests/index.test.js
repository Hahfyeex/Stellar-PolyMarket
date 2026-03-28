"use strict";

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock("firebase-admin", () => ({ apps: [true], initializeApp: jest.fn() }), { virtual: true });
jest.mock("../middleware/appCheck", () => (req, res, next) => next());

const request = require("supertest");
const express = require("express");
const { applyCommonMiddleware, applyErrorHandlers } = require("../index");

function buildApp() {
  const app = express();
  applyCommonMiddleware(app);
  app.post("/echo", (req, res) => {
    res.json({ received: req.body.payload?.length ?? 0 });
  });
  applyErrorHandlers(app);
  return app;
}

describe("request body size limits", () => {
  it("accepts payloads within the 10kb limit", async () => {
    const app = buildApp();
    const payload = "a".repeat(9 * 1024);

    const res = await request(app).post("/echo").send({ payload });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: payload.length });
  });

  it("returns 413 for JSON bodies larger than 10kb", async () => {
    const app = buildApp();
    const payload = "a".repeat(11 * 1024);

    const res = await request(app).post("/echo").send({ payload });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "Request body exceeds the 10kb limit." });
  });

  it("does not expose internal parser details in the 413 response", async () => {
    const app = buildApp();
    const payload = "a".repeat(11 * 1024);

    const res = await request(app).post("/echo").send({ payload });

    expect(JSON.stringify(res.body)).not.toContain("entity.too.large");
    expect(JSON.stringify(res.body)).not.toContain("PayloadTooLargeError");
  });
});
