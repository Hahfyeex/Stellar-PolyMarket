const request = require("supertest");
const express = require("express");
const userService = require("../services/userService");
const usersInterRoute = require("../routes/users");

jest.mock("../services/userService");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe("DELETE /api/users/:walletAddress/gdpr", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/users", usersInterRoute);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should return 200 on successful scrub", async () => {
    const walletAddress = "0x123";
    userService.scrubUser.mockResolvedValueOnce({
      user: { wallet_address: walletAddress, email: "[DELETED]" },
      auditLogId: 42,
    });

    const response = await request(app).delete(`/api/users/${walletAddress}/gdpr`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.email).toBe("[DELETED]");
    expect(response.body.auditLogId).toBe(42);
  });

  test("should return 404 if user not found", async () => {
    const walletAddress = "0xNONEXISTENT";
    userService.scrubUser.mockRejectedValueOnce(new Error("User not found"));

    const response = await request(app).delete(`/api/users/${walletAddress}/gdpr`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("User not found");
  });

  test("should return 500 on internal error", async () => {
    const walletAddress = "0x123";
    userService.scrubUser.mockRejectedValueOnce(new Error("Unexpected crash"));

    const response = await request(app).delete(`/api/users/${walletAddress}/gdpr`);

    expect(response.status).toBe(500);
    expect(response.body.error).toContain("Internal server error");
  });
});
