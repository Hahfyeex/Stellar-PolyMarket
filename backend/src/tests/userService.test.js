const userService = require("../services/userService");
const db = require("../db");

jest.mock("../db");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe("UserService - scrubUser", () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    db.connect.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should successfully scrub user PII and create audit log", async () => {
    const walletAddress = "0x123";
    
    // Mock sequential queries
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ wallet_address: walletAddress }] }) // SELECT
      .mockResolvedValueOnce({ rows: [{ wallet_address: walletAddress, email: "[DELETED]" }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT audit
      .mockResolvedValueOnce({}); // COMMIT

    const result = await userService.scrubUser(walletAddress);

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("SELECT * FROM users WHERE wallet_address = $1", [walletAddress]);
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE users"), expect.any(Array));
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO audit_logs"), expect.any(Array));
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();

    expect(result.user.email).toBe("[DELETED]");
    expect(result.auditLogId).toBe(1);
  });

  test("should throw error if user not found", async () => {
    const walletAddress = "0xNONEXISTENT";
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT (none)
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(userService.scrubUser(walletAddress)).rejects.toThrow("User not found");
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });

  test("should rollback on database error", async () => {
    const walletAddress = "0x123";
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ wallet_address: walletAddress }] }) // SELECT
      .mockRejectedValueOnce(new Error("Database failure")) // UPDATE (fail)
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(userService.scrubUser(walletAddress)).rejects.toThrow("Database failure");
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });
});
