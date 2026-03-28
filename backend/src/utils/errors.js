const logger = require("./logger");

/**
 * Maps PostgreSQL error codes to safe, user-facing messages.
 * Logs full error details for internal debugging.
 * 
 * @param {Error} err - The error object from the database or elsewhere
 * @param {string} requestId - The unique ID for the request
 * @returns {string} Safe error message
 */
function sanitizeError(err, requestId) {
  // Log the full error internally
  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail,
    },
    requestId,
  }, "Database or Internal Error");

  // Map known PG error codes
  if (err.code === "23505") {
    return "A record with this value already exists";
  }
  if (err.code === "23503") {
    return "Referenced record not found";
  }

  // Default safe message
  return "An unexpected error occurred";
}

module.exports = { sanitizeError };
