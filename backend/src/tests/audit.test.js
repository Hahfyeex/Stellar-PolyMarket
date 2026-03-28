/**
 * Tests for the audit logging system:
 * - AuditLogger IPFS pinning (with mocked HTTP client)
 * - GET /api/audit-logs endpoints (with mocked DB)
 * - Non-blocking behavior when IPFS fails
 */

const { AuditLogger } = require("../utils/audit-logger");

// ─── AuditLogger unit tests ────────────────────────────────────────────

describe("AuditLogger", () => {
  test("should return CID on successful IPFS pin", async () => {
    const mockClient = {
      post: jest.fn().mockResolvedValue({
        data: { IpfsHash: "QmTestCid123" },
      }),
    };

    const logger = new AuditLogger(mockClient);
    const cid = await logger.log({
      actor: "GABCDEF",
      action: "MARKET_CREATED",
      details: { marketId: 1 },
      timestamp: "2026-01-01T00:00:00Z",
    });

    expect(cid).toBe("QmTestCid123");
    expect(mockClient.post).toHaveBeenCalledTimes(1);

    // Verify payload structure sent to Pinata
    const callArgs = mockClient.post.mock.calls[0];
    expect(callArgs[1].pinataContent).toEqual({
      actor: "GABCDEF",
      action: "MARKET_CREATED",
      details: { marketId: 1 },
      timestamp: "2026-01-01T00:00:00Z",
    });
  });

  test("should return null and not throw when IPFS fails", async () => {
    const mockClient = {
      post: jest.fn().mockRejectedValue(new Error("Network timeout")),
    };

    const logger = new AuditLogger(mockClient);
    const cid = await logger.log({
      actor: "GABCDEF",
      action: "BET_PLACED",
      details: { amount: 100 },
    });

    // Non-blocking — should return null, not throw
    expect(cid).toBeNull();
  });

  test("should use current timestamp when none provided", async () => {
    const mockClient = {
      post: jest.fn().mockResolvedValue({
        data: { IpfsHash: "QmAutoTimestamp" },
      }),
    };

    const logger = new AuditLogger(mockClient);
    await logger.log({
      actor: "GABCDEF",
      action: "MARKET_RESOLVED",
      details: {},
    });

    const payload = mockClient.post.mock.calls[0][1].pinataContent;
    expect(payload.timestamp).toBeDefined();
    // Should be a valid ISO string
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });
});

// ─── Audit route tests (mocked DB) ─────────────────────────────────────

describe("Audit Routes", () => {
  let app;

  // Mock the db module before requiring routes
  jest.mock("../db", () => ({
    query: jest.fn(),
  }));

  // Mock the audit logger to avoid real IPFS calls
  jest.mock("../utils/audit-logger", () => ({
    AuditLogger: jest.fn().mockImplementation(() => ({
      log: jest.fn().mockResolvedValue("QmMockedCid"),
    })),
  }));

  const db = require("../db");

  beforeEach(() => {
    jest.clearAllMocks();

    // Build a fresh Express app for each test
    const express = require("express");
    app = express();
    app.use(express.json());
    app.use("/api/audit-logs", require("../routes/audit"));
  });

  // Use supertest-style testing via direct HTTP
  const request = (method, path, body) => {
    const http = require("http");
    return new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = server.address().port;
        const options = {
          hostname: "localhost",
          port,
          path,
          method,
          headers: { "Content-Type": "application/json" },
        };
        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          });
        });
        req.on("error", (err) => {
          server.close();
          reject(err);
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
      });
    });
  };

  test("GET /api/audit-logs should return all logs", async () => {
    const mockRows = [
      { id: 1, actor: "GABCDEF", action: "MARKET_CREATED", ipfs_cid: "QmTest1" },
      { id: 2, actor: "GXYZ", action: "BET_PLACED", ipfs_cid: "QmTest2" },
    ];
    db.query.mockResolvedValue({ rows: mockRows });

    const res = await request("GET", "/api/audit-logs");

    expect(res.status).toBe(200);
    expect(res.body.auditLogs).toHaveLength(2);
    expect(res.body.auditLogs[0].actor).toBe("GABCDEF");
  });

  test("GET /api/audit-logs/:id should return single log", async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 1, actor: "GABCDEF", action: "MARKET_CREATED", ipfs_cid: "QmTest1" }],
    });

    const res = await request("GET", "/api/audit-logs/1");

    expect(res.status).toBe(200);
    expect(res.body.auditLog.id).toBe(1);
  });

  test("GET /api/audit-logs/:id should return 404 for missing log", async () => {
    db.query.mockResolvedValue({ rows: [] });

    const res = await request("GET", "/api/audit-logs/999");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Audit log not found");
  });

  test("POST /api/audit-logs should create a log entry", async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 1, actor: "GABCDEF", action: "MARKET_CREATED", ipfs_cid: "QmMockedCid" }],
    });

    const res = await request("POST", "/api/audit-logs", {
      actor: "GABCDEF",
      action: "MARKET_CREATED",
      details: { marketId: 1 },
    });

    expect(res.status).toBe(201);
    expect(res.body.auditLog.ipfs_cid).toBe("QmMockedCid");
  });

  test("POST /api/audit-logs should return 400 without required fields", async () => {
    const res = await request("POST", "/api/audit-logs", { action: "TEST" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("actor and action are required");
  });
});
