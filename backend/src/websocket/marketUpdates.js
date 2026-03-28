/**
 * websocket/marketUpdates.js
 *
 * Real-time market updates WebSocket server.
 * Handles subscriptions, broadcasts, and heartbeat.
 *
 * Message types:
 *   - SUBSCRIBE: client sends { type: 'SUBSCRIBE', market_ids: [1, 2, 3] }
 *   - BET_PLACED: server broadcasts { type: 'BET_PLACED', market_id, bet }
 *   - MARKET_RESOLVED: server broadcasts { type: 'MARKET_RESOLVED', market_id, winning_outcome }
 *   - ODDS_CHANGED: server broadcasts { type: 'ODDS_CHANGED', market_id, odds }
 */

"use strict";

const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds

// Track client subscriptions: clientId → Set of market_ids
const clientSubscriptions = new Map();

// Track all connected clients: clientId → { ws, walletAddress, isAlive }
const connectedClients = new Map();

let clientIdCounter = 0;

/**
 * Attach the market updates WebSocket server to an existing HTTP server.
 *
 * @param {import('http').Server} httpServer
 */
function attach(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/markets" });

  wss.on("connection", (ws, req) => {
    const clientId = ++clientIdCounter;
    const token = extractToken(req);

    // Validate JWT on upgrade
    let decoded;
    try {
      if (!token) {
        ws.close(1008, "Unauthorized: missing token");
        return;
      }
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      logger.warn({ error: err.message }, "WS auth failed");
      ws.close(1008, "Unauthorized: invalid token");
      return;
    }

    const walletAddress = decoded.sub || decoded.wallet_address;
    connectedClients.set(clientId, {
      ws,
      walletAddress,
      isAlive: true,
    });
    clientSubscriptions.set(clientId, new Set());

    logger.info(
      { clientId, walletAddress },
      "WS client connected"
    );

    // Handle incoming messages
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        handleMessage(clientId, message);
      } catch (err) {
        logger.warn({ clientId, error: err.message }, "WS message parse error");
        ws.send(JSON.stringify({ type: "ERROR", error: "Invalid message format" }));
      }
    });

    // Handle pong (heartbeat response)
    ws.on("pong", () => {
      const client = connectedClients.get(clientId);
      if (client) {
        client.isAlive = true;
      }
    });

    // Handle disconnect
    ws.on("close", () => {
      connectedClients.delete(clientId);
      clientSubscriptions.delete(clientId);
      logger.info({ clientId }, "WS client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ clientId, error: err.message }, "WS error");
    });
  });

  // Heartbeat: ping every 30 seconds, close if no pong
  const heartbeatInterval = setInterval(() => {
    connectedClients.forEach((client, clientId) => {
      if (!client.isAlive) {
        logger.warn({ clientId }, "WS heartbeat timeout, closing");
        client.ws.terminate();
        connectedClients.delete(clientId);
        clientSubscriptions.delete(clientId);
        return;
      }
      client.isAlive = false;
      client.ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  logger.info("Market updates WebSocket server attached at /ws/markets");
  return wss;
}

/**
 * Extract JWT token from WebSocket upgrade request.
 * Looks for: Authorization header or ?token query param
 */
function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams.get("token");
}

/**
 * Handle incoming WebSocket message.
 */
function handleMessage(clientId, message) {
  const { type, market_ids } = message;

  if (type === "SUBSCRIBE") {
    if (!Array.isArray(market_ids)) {
      logger.warn({ clientId }, "SUBSCRIBE: market_ids must be an array");
      return;
    }

    const subscriptions = clientSubscriptions.get(clientId);
    market_ids.forEach((id) => subscriptions.add(id));

    logger.debug(
      { clientId, market_ids, total_subscriptions: subscriptions.size },
      "Client subscribed"
    );

    const client = connectedClients.get(clientId);
    if (client) {
      client.ws.send(
        JSON.stringify({
          type: "SUBSCRIBED",
          market_ids,
        })
      );
    }
  }
}

/**
 * Broadcast a message to all clients subscribed to a market.
 *
 * @param {number} marketId
 * @param {object} message - Message to broadcast (must have type field)
 */
function broadcast(marketId, message) {
  let count = 0;
  connectedClients.forEach((client, clientId) => {
    const subscriptions = clientSubscriptions.get(clientId);
    if (subscriptions && subscriptions.has(marketId)) {
      try {
        client.ws.send(JSON.stringify(message));
        count++;
      } catch (err) {
        logger.error({ clientId, error: err.message }, "WS broadcast failed");
      }
    }
  });

  if (count > 0) {
    logger.debug(
      { marketId, message_type: message.type, recipients: count },
      "WS broadcast sent"
    );
  }
}

/**
 * Broadcast BET_PLACED event.
 */
function broadcastBetPlaced(marketId, bet) {
  broadcast(marketId, {
    type: "BET_PLACED",
    market_id: marketId,
    bet,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast MARKET_RESOLVED event.
 */
function broadcastMarketResolved(marketId, winningOutcome) {
  broadcast(marketId, {
    type: "MARKET_RESOLVED",
    market_id: marketId,
    winning_outcome: winningOutcome,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast ODDS_CHANGED event.
 */
function broadcastOddsChanged(marketId, odds) {
  broadcast(marketId, {
    type: "ODDS_CHANGED",
    market_id: marketId,
    odds,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  attach,
  broadcastBetPlaced,
  broadcastMarketResolved,
  broadcastOddsChanged,
};
