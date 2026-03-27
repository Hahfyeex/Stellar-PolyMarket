/**
 * graphql/pubsub.js
 *
 * Minimal in-process pub/sub for GraphQL subscriptions.
 * Channels: betPlaced, marketResolved, oddsChanged
 *
 * Each channel is keyed by marketId so subscribers only receive
 * events for the market they care about.
 */

"use strict";

const { EventEmitter } = require("events");

const emitter = new EventEmitter();
emitter.setMaxListeners(500); // support many concurrent subscribers

/**
 * Publish an event to a channel.
 * @param {string} channel  - e.g. 'betPlaced'
 * @param {number} marketId
 * @param {object} payload
 */
function publish(channel, marketId, payload) {
  emitter.emit(`${channel}:${marketId}`, payload);
}

/**
 * Subscribe to a channel for a specific marketId.
 * Returns an async iterator that yields payloads.
 *
 * @param {string} channel
 * @param {number} marketId
 * @returns {AsyncIterator}
 */
function subscribe(channel, marketId) {
  const topic = `${channel}:${marketId}`;
  const queue = [];
  let resolve = null;

  function onEvent(payload) {
    if (resolve) {
      const r = resolve;
      resolve = null;
      r({ value: payload, done: false });
    } else {
      queue.push(payload);
    }
  }

  emitter.on(topic, onEvent);

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift(), done: false });
      }
      return new Promise((res) => {
        resolve = res;
      });
    },
    return() {
      emitter.off(topic, onEvent);
      return Promise.resolve({ value: undefined, done: true });
    },
  };
}

module.exports = { publish, subscribe };
