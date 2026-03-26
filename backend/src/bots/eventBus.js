"use strict";

const { EventEmitter } = require("events");

/**
 * Platform-wide event bus — a singleton EventEmitter.
 *
 * Events emitted:
 *   "market.created"  — payload: { marketId, question, outcomes, totalPool }
 *   "pool.low"        — payload: { marketId, totalPool, threshold }
 *
 * Bot strategies subscribe to these events via eventBus.on(event, handler).
 * Using a singleton ensures all modules share the same bus without coupling.
 */
const eventBus = new EventEmitter();

// Prevent Node.js MaxListenersExceededWarning when many bots are registered
eventBus.setMaxListeners(50);

module.exports = eventBus;
