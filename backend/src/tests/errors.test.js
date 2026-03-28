const { sanitizeError } = require("../utils/errors");

describe("sanitizeError", () => {
  const requestId = "test-request-id";

  test("should map PG unique violation (23505) to safe message", () => {
    const err = { code: "23505", message: "duplicate key value violates unique constraint" };
    const result = sanitizeError(err, requestId);
    expect(result).toBe("A record with this value already exists");
  });

  test("should map PG foreign key violation (23503) to safe message", () => {
    const err = { code: "23503", message: "insert or update on table violates foreign key constraint" };
    const result = sanitizeError(err, requestId);
    expect(result).toBe("Referenced record not found");
  });

  test("should map unknown errors to generic message", () => {
    const err = new Error("Something went wrong");
    const result = sanitizeError(err, requestId);
    expect(result).toBe("An unexpected error occurred");
  });

  test("should handle errors without a code", () => {
    const err = { message: "Unknown error" };
    const result = sanitizeError(err, requestId);
    expect(result).toBe("An unexpected error occurred");
  });
});
