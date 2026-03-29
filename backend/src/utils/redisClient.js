"use strict";

const { createClient } = require("redis");

const client = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
  },
});

client.on("error", (err) => {
  console.error("[Redis] Client error:", err.message);
});

let connectPromise = null;

function getClient() {
  if (!connectPromise) {
    connectPromise = client.connect().then(() => {
      return client;
    });
  }
  return connectPromise;
}

const redisProxy = new Proxy(
  {},
  {
    get: (_target, prop) => {
      return async (...args) => {
        const c = await getClient();
        return c[prop](...args);
      };
    },
  }
);

module.exports = redisProxy;
