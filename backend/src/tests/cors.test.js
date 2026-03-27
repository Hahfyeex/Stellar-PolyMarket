/**
 * Integration tests for CORS origin restriction (#222)
 */

const request = require("supertest");

// Must set env before requiring the app so the cors middleware picks it up
process.env.ALLOWED_ORIGINS = "https://app.stellapolymarket.com";
// Stub heavy side-effects so the module loads cleanly in tests
jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
}));
jest.mock("../middleware/appCheck", () => (req, res, next) => next());
jest.mock("../services/tvlService", () => ({ startPoller: jest.fn() }));
jest.mock("../bots/registry", () => {});
jest.mock("../workers/resolver", () => ({ start: jest.fn() }));
jest.mock("../workers/archive-worker", () => ({ start: jest.fn() }));
jest.mock("../indexer/mercury", () => ({ subscribe: jest.fn() }));
jest.mock("../indexer/gap-detector", () => ({ initializeSelfHealing: jest.fn() }));
jest.mock("../graphql/schema", () => ({}));
jest.mock("../graphql/wsServer", () => ({ attach: jest.fn() }));
jest.mock("../routes/markets", () => require("express").Router());
jest.mock("../routes/bets", () => require("express").Router());
jest.mock("../routes/notifications", () => require("express").Router());
jest.mock("../routes/reserves", () => require("express").Router());
jest.mock("../routes/status", () => require("express").Router());
jest.mock("../routes/images", () => require("express").Router());
jest.mock("../routes/oracles", () => require("express").Router());
jest.mock("../routes/tvl", () => require("express").Router());
jest.mock("../routes/governance", () => require("express").Router());
jest.mock("../routes/admin", () => require("express").Router());
jest.mock("../routes/indexer", () => require("express").Router());
jest.mock("../routes/archive", () => require("express").Router());
jest.mock("../routes/metrics", () => require("express").Router());
jest.mock("../routes/health/protocolHealth", () => require("express").Router());
jest.mock("graphql-yoga", () => ({
  createYoga: () => ({ handle: jest.fn(), graphqlEndpoint: "/graphql" }),
}));

// Require app after mocks are in place
// We only need the express app, not the http server listen call.
// Re-export just the app by isolating the module.
let app;
beforeAll(() => {
  // Prevent the server from actually binding a port
  jest.spyOn(require("http"), "createServer").mockReturnValue({
    listen: jest.fn(),
  });
  app = require("../index");
});

describe("CORS origin restriction", () => {
  it("allows requests from a listed origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://app.stellapolymarket.com");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://app.stellapolymarket.com"
    );
    expect(res.status).toBe(200);
  });

  it("rejects requests from an unlisted origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example.com");
    // CORS error → express error handler returns 500, and no allow header
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows server-to-server requests with no Origin header", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});
