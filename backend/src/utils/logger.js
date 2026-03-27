const pino = require("pino");

/**
 * Structured JSON Logger using Pino
 * 
 * Log Levels (in order of severity):
 * - fatal (60): Application crash, requires immediate attention
 * - error (50): Error events that might still allow the app to continue
 * - warn (40): Warning messages for potentially harmful situations
 * - info (30): Informational messages highlighting progress
 * - debug (20): Detailed information for debugging
 * - trace (10): Very detailed diagnostic information
 */

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: "stella-polymarket-api",
    environment: process.env.NODE_ENV || "development",
  },
  // Use pino-pretty for local development, raw JSON in production
  transport: process.env.NODE_ENV === "production" ? undefined : {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
});

/**
 * Create a child logger with additional context
 * @param {Object} bindings - Additional fields to include in all logs
 * @returns {Object} Child logger instance
 */
function createChildLogger(bindings) {
  return logger.child(bindings);
}

module.exports = logger;
module.exports.createChildLogger = createChildLogger;
