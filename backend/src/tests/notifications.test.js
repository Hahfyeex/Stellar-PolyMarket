/**
 * Tests for /api/notifications endpoints and triggerNotification utility.
 */

jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const db = require("../db");
const express = require("express");
const http = require("http");

// ── JWT helper ──────────────────────────────────────────────────────────────
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const validToken = jwt.sign({ sub: "test" }, JWT_SECRET);
const authHeader = `Bearer ${validToken}`;

// ── App setup ───────────────────────────────────────────────────────────────
let app;
beforeEach(() => {
  jest.clearAllMocks();
  app = express();
  app.use(express.json());
  app.use("/api/notifications", require("../routes/notifications"));
});

// ── HTTP helper ─────────────────────────────────────────────────────────────
function request(method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = {
        hostname: "localhost",
        port,
        path,
        method,
        headers: { "Content-Type": "application/json", ...headers },
      };
      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        });
      });
      req.on("error", (e) => {
        server.close();
        reject(e);
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

// ── GET /api/notifications ──────────────────────────────────────────────────
describe("GET /api/notifications", () => {
  test("returns 401 without token", async () => {
    const res = await request("GET", "/api/notifications?wallet=GABC");
    expect(res.status).toBe(401);
  });

  test("returns 400 when wallet param missing", async () => {
    const res = await request("GET", "/api/notifications", {
      headers: { Authorization: authHeader },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wallet/);
  });

  test("returns notifications for wallet", async () => {
    const rows = [
      {
        id: 1,
        wallet_address: "GABC",
        type: "MARKET_RESOLVED",
        message: "Market resolved",
        market_id: 1,
        read: false,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    db.query.mockResolvedValue({ rows });

    const res = await request("GET", "/api/notifications?wallet=GABC", {
      headers: { Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].type).toBe("MARKET_RESOLVED");
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("wallet_address = $1"), ["GABC"]);
  });

  test("returns 500 on db error", async () => {
    db.query.mockRejectedValue(new Error("DB down"));
    const res = await request("GET", "/api/notifications?wallet=GABC", {
      headers: { Authorization: authHeader },
    });
    expect(res.status).toBe(500);
  });
});

// ── POST /api/notifications/mark-read ──────────────────────────────────────
describe("POST /api/notifications/mark-read", () => {
  test("returns 401 without token", async () => {
    const res = await request("POST", "/api/notifications/mark-read", { body: { id: 1 } });
    expect(res.status).toBe(401);
  });

  test("returns 400 when id missing", async () => {
    const res = await request("POST", "/api/notifications/mark-read", {
      body: {},
      headers: { Authorization: authHeader },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id/);
  });

  test("returns 404 when notification not found", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request("POST", "/api/notifications/mark-read", {
      body: { id: 999 },
      headers: { Authorization: authHeader },
    });
    expect(res.status).toBe(404);
  });

  test("marks notification as read", async () => {
    const row = { id: 1, read: true };
    db.query.mockResolvedValue({ rows: [row] });

    const res = await request("POST", "/api/notifications/mark-read", {
      body: { id: 1 },
      headers: { Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notification.read).toBe(true);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("read = TRUE"), [1]);
  });

  test("returns 500 on db error", async () => {
    db.query.mockRejectedValue(new Error("DB down"));
    const res = await request("POST", "/api/notifications/mark-read", {
      body: { id: 1 },
      headers: { Authorization: authHeader },
    });
    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/notifications/clear ────────────────────────────────────────
describe("DELETE /api/notifications/clear", () => {
  test("returns 401 without token", async () => {
    const res = await request("DELETE", "/api/notifications/clear?wallet=GABC");
    expect(res.status).toBe(401);
  });

  test("returns 400 when wallet param missing", async () => {
    const res = await request("DELETE", "/api/notifications/clear", {
      headers: { Authorization: authHeader },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wallet/);
  });

  test("clears all notifications for wallet", async () => {
    db.query.mockResolvedValue({ rowCount: 3 });

    const res = await request("DELETE", "/api/notifications/clear?wallet=GABC", {
      headers: { Authorization: authHeader },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toBe(3);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM notifications"), [
      "GABC",
    ]);
  });

  test("returns 500 on db error", async () => {
    db.query.mockRejectedValue(new Error("DB down"));
    const res = await request("DELETE", "/api/notifications/clear?wallet=GABC", {
      headers: { Authorization: authHeader },
    });
    expect(res.status).toBe(500);
  });
});

// ── triggerNotification utility ─────────────────────────────────────────────
describe("triggerNotification", () => {
  // Re-require after mocks are set up
  const { triggerNotification } = require("../utils/notifications");

  test("inserts a notification row", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await triggerNotification("GABC", "MARKET_RESOLVED", "Market 1 resolved", 1);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO notifications"), [
      "GABC",
      "MARKET_RESOLVED",
      "Market 1 resolved",
      1,
    ]);
  });

  test("defaults marketId to null", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await triggerNotification("GABC", "MARKET_PROPOSED", "New market");
    expect(db.query).toHaveBeenCalledWith(expect.any(String), [
      "GABC",
      "MARKET_PROPOSED",
      "New market",
      null,
    ]);
  });

  test("does not throw when db fails", async () => {
    db.query.mockRejectedValue(new Error("DB down"));
    await expect(triggerNotification("GABC", "MARKET_RESOLVED", "msg", 1)).resolves.toBeUndefined();
  });
});
