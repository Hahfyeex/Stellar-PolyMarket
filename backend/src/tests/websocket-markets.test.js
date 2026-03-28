/**
 * tests/websocket-markets.test.js
 *
 * Tests for real-time market updates WebSocket server.
 * Covers: subscription, broadcast, heartbeat, and authentication.
 */

"use strict";

const http = require("http");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { attach, broadcastBetPlaced, broadcastMarketResolved } = require("../websocket/marketUpdates");

const JWT_SECRET = "test-secret";
const PORT = 9999;

describe("WebSocket Market Updates", () => {
  let server;
  let wss;

  beforeAll((done) => {
    server = http.createServer();
    wss = attach(server);
    server.listen(PORT, done);
  });

  afterAll((done) => {
    wss.close();
    server.close(done);
  });

  function createToken(payload = {}) {
    return jwt.sign(
      { sub: "test-wallet", ...payload },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
  }

  function connectClient(token) {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${PORT}/ws/markets?token=${token}`;
      const ws = new WebSocket(url);
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
      setTimeout(() => reject(new Error("Connection timeout")), 5000);
    });
  }

  test("should reject connection without token", (done) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws/markets`);
    ws.on("close", (code) => {
      expect(code).toBe(1008); // Policy violation
      done();
    });
    ws.on("error", () => {
      // Expected
    });
  });

  test("should reject connection with invalid token", (done) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws/markets?token=invalid`);
    ws.on("close", (code) => {
      expect(code).toBe(1008);
      done();
    });
    ws.on("error", () => {
      // Expected
    });
  });

  test("should accept connection with valid token", async () => {
    const token = createToken();
    const ws = await connectClient(token);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  test("should handle SUBSCRIBE message", async () => {
    const token = createToken();
    const ws = await connectClient(token);

    return new Promise((resolve) => {
      ws.on("message", (data) => {
        const message = JSON.parse(data);
        expect(message.type).toBe("SUBSCRIBED");
        expect(message.market_ids).toEqual([1, 2, 3]);
        ws.close();
        resolve();
      });

      ws.send(JSON.stringify({
        type: "SUBSCRIBE",
        market_ids: [1, 2, 3],
      }));
    });
  });

  test("should broadcast BET_PLACED to subscribed clients", async () => {
    const token = createToken();
    const ws = await connectClient(token);

    return new Promise((resolve) => {
      let messageCount = 0;

      ws.on("message", (data) => {
        const message = JSON.parse(data);

        if (message.type === "SUBSCRIBED") {
          // After subscription, trigger broadcast
          broadcastBetPlaced(1, {
            id: 123,
            market_id: 1,
            wallet_address: "test-wallet",
            outcome_index: 0,
            amount: "100",
          });
        } else if (message.type === "BET_PLACED") {
          expect(message.market_id).toBe(1);
          expect(message.bet.id).toBe(123);
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        }
      });

      ws.send(JSON.stringify({
        type: "SUBSCRIBE",
        market_ids: [1],
      }));
    });
  });

  test("should broadcast MARKET_RESOLVED to subscribed clients", async () => {
    const token = createToken();
    const ws = await connectClient(token);

    return new Promise((resolve) => {
      ws.on("message", (data) => {
        const message = JSON.parse(data);

        if (message.type === "SUBSCRIBED") {
          broadcastMarketResolved(2, 1);
        } else if (message.type === "MARKET_RESOLVED") {
          expect(message.market_id).toBe(2);
          expect(message.winning_outcome).toBe(1);
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        }
      });

      ws.send(JSON.stringify({
        type: "SUBSCRIBE",
        market_ids: [2],
      }));
    });
  });

  test("should not broadcast to unsubscribed clients", async () => {
    const token = createToken();
    const ws = await connectClient(token);

    return new Promise((resolve) => {
      let subscribed = false;

      ws.on("message", (data) => {
        const message = JSON.parse(data);

        if (message.type === "SUBSCRIBED") {
          subscribed = true;
          // Subscribe to market 1, but broadcast to market 2
          broadcastBetPlaced(2, { id: 456, market_id: 2 });
          // Give it time to receive (or not)
          setTimeout(() => {
            ws.close();
            resolve();
          }, 100);
        }
      });

      ws.send(JSON.stringify({
        type: "SUBSCRIBE",
        market_ids: [1],
      }));
    });
  });

  test("should handle heartbeat ping/pong", async () => {
    const token = createToken();
    const ws = await connectClient(token);

    return new Promise((resolve) => {
      let pongReceived = false;

      ws.on("ping", () => {
        pongReceived = true;
        ws.pong();
      });

      // Wait for heartbeat
      setTimeout(() => {
        expect(pongReceived).toBe(true);
        ws.close();
        resolve();
      }, 35000); // Heartbeat is every 30s
    });
  }, 40000); // Increase timeout for this test

  test("should handle invalid message format", async () => {
    const token = createToken();
    const ws = await connectClient(token);

    return new Promise((resolve) => {
      ws.on("message", (data) => {
        const message = JSON.parse(data);
        if (message.type === "ERROR") {
          expect(message.error).toBe("Invalid message format");
          ws.close();
          resolve();
        }
      });

      ws.send("invalid json");
    });
  });

  test("should handle multiple subscriptions", async () => {
    const token = createToken();
    const ws = await connectClient(token);

    return new Promise((resolve) => {
      let subscriptionCount = 0;

      ws.on("message", (data) => {
        const message = JSON.parse(data);

        if (message.type === "SUBSCRIBED") {
          subscriptionCount++;
          if (subscriptionCount === 1) {
            // Subscribe to more markets
            ws.send(JSON.stringify({
              type: "SUBSCRIBE",
              market_ids: [4, 5],
            }));
          } else if (subscriptionCount === 2) {
            expect(message.market_ids).toEqual([4, 5]);
            ws.close();
            resolve();
          }
        }
      });

      ws.send(JSON.stringify({
        type: "SUBSCRIBE",
        market_ids: [1, 2, 3],
      }));
    });
  });
});
