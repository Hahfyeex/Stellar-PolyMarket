/**
 * graphql/wsServer.js
 *
 * graphql-ws WebSocket server for GraphQL subscriptions.
 *
 * Security:
 *   - JWT validated on every WebSocket upgrade (connectionParams.authorization)
 *   - Max 5 concurrent subscriptions per authenticated user
 *
 * Usage: call attach(httpServer) after creating the HTTP server.
 */

"use strict";

const { useServer } = require("graphql-ws/use/ws");
const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const MAX_SUBS_PER_USER = 5;

// Track active subscription count per user: walletAddress → count
const userSubCount = new Map();

/**
 * Attach the graphql-ws server to an existing HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @param {import('graphql').GraphQLSchema} schema
 */
function attach(httpServer, schema) {
  const wss = new WebSocketServer({ server: httpServer, path: "/graphql" });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useServer(
    {
      schema,

      // ── Auth on connection ──────────────────────────────────────────────────
      onConnect(ctx) {
        const token =
          ctx.connectionParams?.authorization?.replace(/^Bearer\s+/i, "") ||
          ctx.connectionParams?.Authorization?.replace(/^Bearer\s+/i, "");

        if (!token) {
          throw new Error("Unauthorized: missing authorization token");
        }

        let decoded;
        try {
          decoded = jwt.verify(token, JWT_SECRET);
        } catch {
          throw new Error("Unauthorized: invalid or expired token");
        }

        // Attach user to context so onSubscribe can read it
        ctx.extra.user = decoded;
        logger.info({ sub: decoded.sub }, "WS client connected");
      },

      // ── Rate limit: max 5 subscriptions per user ────────────────────────────
      onSubscribe(ctx) {
        const userId = ctx.extra.user?.sub || ctx.extra.user?.wallet_address || "unknown";
        const current = userSubCount.get(userId) || 0;

        if (current >= MAX_SUBS_PER_USER) {
          throw new Error(`Too many subscriptions: max ${MAX_SUBS_PER_USER} per user`);
        }

        userSubCount.set(userId, current + 1);
        logger.debug({ userId, subs: current + 1 }, "Subscription opened");
      },

      // ── Cleanup on subscription complete ───────────────────────────────────
      onComplete(ctx) {
        const userId = ctx.extra.user?.sub || ctx.extra.user?.wallet_address || "unknown";
        const current = userSubCount.get(userId) || 1;
        const next = Math.max(0, current - 1);
        if (next === 0) {
          userSubCount.delete(userId);
        } else {
          userSubCount.set(userId, next);
        }
        logger.debug({ userId, subs: next }, "Subscription closed");
      },

      onError(ctx, msg, errors) {
        logger.error({ errors }, "WS subscription error");
      },
    },
    wss
  );

  logger.info("graphql-ws WebSocket server attached at /graphql");
  return wss;
}

module.exports = { attach, _userSubCount: userSubCount };
