const {
  generateShortCode,
  SAFE_CHARS,
  BLOCKED_PATTERNS,
  redirectHandler,
} = require("../routes/shorturl");

// ── Unit tests for hash generation ──────────────────────────────────

describe("generateShortCode", () => {
  test("should produce a 6-character string", () => {
    const code = generateShortCode();
    expect(code).toHaveLength(6);
  });

  test("should only contain safe characters", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateShortCode();
      for (const ch of code) {
        expect(SAFE_CHARS).toContain(ch);
      }
    }
  });

  test("should not contain ambiguous characters (0, O, I, l)", () => {
    const ambiguous = ["0", "O", "I", "l"];
    for (let i = 0; i < 100; i++) {
      const code = generateShortCode();
      for (const ch of ambiguous) {
        expect(code).not.toContain(ch);
      }
    }
  });

  test("should not contain offensive patterns", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShortCode();
      for (const pattern of BLOCKED_PATTERNS) {
        expect(pattern.test(code)).toBe(false);
      }
    }
  });

  test("should generate different codes across calls", () => {
    const codes = new Set();
    for (let i = 0; i < 50; i++) {
      codes.add(generateShortCode());
    }
    // With 6-char codes from 55-char alphabet, collisions in 50 calls are astronomically unlikely
    expect(codes.size).toBeGreaterThan(45);
  });
});

// ── Mock DB for route tests ─────────────────────────────────────────

const mockQuery = jest.fn();
jest.mock("../db", () => ({ query: (...args) => mockQuery(...args) }));

const express = require("express");
const http = require("http");

function createApp() {
  const app = express();
  app.use(express.json());
  const shortUrlRoutes = require("../routes/shorturl");
  app.use("/api/short-url", shortUrlRoutes);
  app.get("/s/:code", shortUrlRoutes.redirectHandler);
  return app;
}

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const options = {
        hostname: "127.0.0.1",
        port,
        path,
        method: method.toUpperCase(),
        headers: { "Content-Type": "application/json" },
      };
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          server.close();
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        });
      });
      req.on("error", (err) => { server.close(); reject(err); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

// ── POST /api/short-url ─────────────────────────────────────────────

describe("POST /api/short-url", () => {
  const app = createApp();

  beforeEach(() => mockQuery.mockReset());

  test("should return 400 when marketId is missing", async () => {
    const res = await request(app, "POST", "/api/short-url", {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/marketId/);
  });

  test("should return 404 when market does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // market lookup
    const res = await request(app, "POST", "/api/short-url", { marketId: 999 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Market not found/);
  });

  test("should return existing short URL if already created", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // market exists
      .mockResolvedValueOnce({ rows: [{ short_code: "AbC123", market_id: 1 }] }); // existing
    const res = await request(app, "POST", "/api/short-url", { marketId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.shortCode).toBe("AbC123");
    expect(res.body.shortUrl).toContain("/s/AbC123");
  });

  test("should create a new short URL and return 201", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // market exists
      .mockResolvedValueOnce({ rows: [] }) // no existing short url
      .mockResolvedValueOnce({ rows: [{ short_code: "Xyz789", market_id: 1 }] }); // insert
    const res = await request(app, "POST", "/api/short-url", { marketId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.shortCode).toHaveLength(6);
    expect(res.body.shortUrl).toContain("/s/");
  });

  test("should return 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));
    const res = await request(app, "POST", "/api/short-url", { marketId: 1 });
    expect(res.status).toBe(500);
  });
});

// ── GET /api/short-url/:code ────────────────────────────────────────

describe("GET /api/short-url/:code", () => {
  const app = createApp();

  beforeEach(() => mockQuery.mockReset());

  test("should return short URL info", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        short_code: "AbC123",
        market_id: 1,
        full_url: "/api/markets/1",
        created_at: "2025-01-01T00:00:00Z",
      }],
    });
    const res = await request(app, "GET", "/api/short-url/AbC123");
    expect(res.status).toBe(200);
    expect(res.body.shortCode).toBe("AbC123");
    expect(res.body.marketId).toBe(1);
    expect(res.body.fullUrl).toBe("/api/markets/1");
  });

  test("should return 404 for unknown code", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app, "GET", "/api/short-url/BADCOD");
    expect(res.status).toBe(404);
  });

  test("should return 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));
    const res = await request(app, "GET", "/api/short-url/AbC123");
    expect(res.status).toBe(500);
  });
});

// ── GET /s/:code (redirect) ────────────────────────────────────────

describe("GET /s/:code (redirect)", () => {
  const app = createApp();

  beforeEach(() => mockQuery.mockReset());

  test("should redirect with 301 to full URL", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ full_url: "/api/markets/1" }],
    });
    // http.request follows redirects differently — we check status + location header
    const res = await new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = server.address().port;
        const options = {
          hostname: "127.0.0.1",
          port,
          path: "/s/AbC123",
          method: "GET",
        };
        const req = http.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            resolve({ status: res.statusCode, headers: res.headers });
          });
        });
        req.on("error", (err) => { server.close(); reject(err); });
        req.end();
      });
    });
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe("/api/markets/1");
  });

  test("should return 404 for invalid short code", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app, "GET", "/s/BADCOD");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Short URL not found/);
  });

  test("should return 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));
    const res = await request(app, "GET", "/s/AbC123");
    expect(res.status).toBe(500);
  });
});
