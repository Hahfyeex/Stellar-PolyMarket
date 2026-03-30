"use strict";

jest.mock("../db");
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
const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

function makeToken(payload = {}) {
  return jwt.sign({ sub: "WALLET123", ...payload }, JWT_SECRET);
}

function makeAdminToken() {
  return jwt.sign({ sub: "ADMIN_WALLET", isAdmin: true }, JWT_SECRET);
}

const commentsRouter = require("../routes/comments");
const commentActionsRouter = require("../routes/commentActions");

const app = express();
app.use(express.json());
app.use("/api/markets/:id/comments", commentsRouter);
app.use("/api/comments", commentActionsRouter);

const makeComment = (id, overrides = {}) => ({
  id,
  market_id: 1,
  wallet_address: "WALLET123",
  content: "Test comment",
  thumbs_up_count: 0,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe("Market Comments API", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── GET /api/markets/:id/comments ──────────────────────────────────────────
  describe("GET /api/markets/:id/comments", () => {
    it("returns paginated non-hidden comments", async () => {
      const comments = [makeComment(1), makeComment(2)];
      db.query
        .mockResolvedValueOnce({ rows: comments })
        .mockResolvedValueOnce({ rows: [{ total: "2" }] });

      const res = await request(app).get("/api/markets/1/comments");

      expect(res.status).toBe(200);
      expect(res.body.comments).toHaveLength(2);
      expect(res.body.meta).toMatchObject({ page: 0, pageSize: 20, total: 2 });
    });

    it("uses page query param for offset", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] });

      await request(app).get("/api/markets/1/comments?page=2");

      expect(db.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("OFFSET $3"),
        [1, 20, 40]
      );
    });

    it("returns 500 on db error", async () => {
      db.query.mockRejectedValueOnce(new Error("DB down"));
      const res = await request(app).get("/api/markets/1/comments");
      expect(res.status).toBe(500);
    });
  });

  // ── POST /api/markets/:id/comments ────────────────────────────────────────
  describe("POST /api/markets/:id/comments", () => {
    it("creates a comment with valid content", async () => {
      const comment = makeComment(1);
      db.query.mockResolvedValueOnce({ rows: [comment] });

      const res = await request(app)
        .post("/api/markets/1/comments")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ content: "Hello world" });

      expect(res.status).toBe(201);
      expect(res.body.comment).toMatchObject({ id: 1 });
    });

    it("rejects missing content", async () => {
      const res = await request(app)
        .post("/api/markets/1/comments")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    it("rejects content over 500 chars", async () => {
      const res = await request(app)
        .post("/api/markets/1/comments")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ content: "x".repeat(501) });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/500/);
    });

    it("rejects empty string content", async () => {
      const res = await request(app)
        .post("/api/markets/1/comments")
        .set("Authorization", `Bearer ${makeToken()}`)
        .send({ content: "   " });
      expect(res.status).toBe(400);
    });

    it("requires JWT", async () => {
      const res = await request(app).post("/api/markets/1/comments").send({ content: "Hello" });
      expect(res.status).toBe(401);
    });

    it("rejects invalid JWT", async () => {
      const res = await request(app)
        .post("/api/markets/1/comments")
        .set("Authorization", "Bearer invalid.token.here")
        .send({ content: "Hello" });
      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/comments/:id/thumbs-up ──────────────────────────────────────
  describe("POST /api/comments/:id/thumbs-up", () => {
    it("increments thumbs_up_count", async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] }) // insert dedup
        .mockResolvedValueOnce({ rows: [{ thumbs_up_count: 1 }] }); // update

      const res = await request(app)
        .post("/api/comments/1/thumbs-up")
        .set("Authorization", `Bearer ${makeToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.thumbs_up_count).toBe(1);
    });

    it("returns 409 on duplicate thumbs-up", async () => {
      const dupErr = new Error("duplicate");
      dupErr.code = "23505";
      db.query.mockRejectedValueOnce(dupErr);

      const res = await request(app)
        .post("/api/comments/1/thumbs-up")
        .set("Authorization", `Bearer ${makeToken()}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already/i);
    });

    it("returns 404 when comment not found", async () => {
      db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }); // no rows from UPDATE

      const res = await request(app)
        .post("/api/comments/999/thumbs-up")
        .set("Authorization", `Bearer ${makeToken()}`);

      expect(res.status).toBe(404);
    });

    it("requires JWT", async () => {
      const res = await request(app).post("/api/comments/1/thumbs-up");
      expect(res.status).toBe(401);
    });
  });

  // ── DELETE /api/comments/:id ──────────────────────────────────────────────
  describe("DELETE /api/comments/:id", () => {
    it("sets is_hidden = TRUE (admin only)", async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const res = await request(app)
        .delete("/api/comments/1")
        .set("Authorization", `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining("is_hidden = TRUE"), [1]);
    });

    it("returns 403 for non-admin JWT", async () => {
      const res = await request(app)
        .delete("/api/comments/1")
        .set("Authorization", `Bearer ${makeToken()}`);
      expect(res.status).toBe(403);
    });

    it("returns 404 when comment not found", async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete("/api/comments/999")
        .set("Authorization", `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(404);
    });

    it("requires JWT", async () => {
      const res = await request(app).delete("/api/comments/1");
      expect(res.status).toBe(401);
    });
  });
});
