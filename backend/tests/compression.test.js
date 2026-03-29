const request = require("supertest");
const express = require("express");
const compression = require("compression");

function buildApp() {
  const app = express();
  app.use(compression({ threshold: 1024 }));

  // Large payload route (>1KB)
  app.get("/large", (_req, res) => {
    res.json({ data: "x".repeat(2000) });
  });

  // Small payload route (<1KB)
  app.get("/small", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe("Gzip compression middleware", () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  test("compresses large payloads (>1KB) with gzip", async () => {
    const res = await request(app)
      .get("/large")
      .set("Accept-Encoding", "gzip");

    expect(res.headers["content-encoding"]).toBe("gzip");
  });

  test("does not compress small payloads (<1KB)", async () => {
    const res = await request(app)
      .get("/small")
      .set("Accept-Encoding", "gzip");

    expect(res.headers["content-encoding"]).toBeUndefined();
  });
});
