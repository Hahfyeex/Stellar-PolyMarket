"use strict";

const eventBus = require("./eventBus");
const logger = require("../utils/logger");

/**
 * BotStrategy — base class for all pluggable bot strategies.
 *
 * Interface every strategy must satisfy:
 *   name          {string}   — unique identifier shown in logs
 *   shouldTrigger(event)     — returns true if this bot should act on the event payload
 *   execute(marketId)        — performs the bot's action; must be async
 *
 * Each instance has an independent killSwitch flag. Setting it to true stops
 * the bot from executing on future events without affecting any other instance.
 *
 * Subclasses override shouldTrigger() and execute(). They call
 * super.register(events) in their constructor to subscribe to the bus.
 */
class BotStrategy {
  /**
   * @param {string} name - Unique strategy name.
   * @param {object} [config={}] - Risk / behaviour parameters (strategy-specific).
   */
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    /** Set to true to permanently stop this bot instance. */
    this.killSwitch = false;
  }

  /**
   * Decide whether this bot should act on an incoming event payload.
   * Override in subclass.
   * @param {object} event - The event payload emitted on the bus.
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  shouldTrigger(event) {
    return true;
  }

  /**
   * Perform the bot's action for the given market.
   * Override in subclass.
   * @param {string|number} marketId
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async execute(marketId) {}

  /**
   * Subscribe this bot to one or more event bus topics.
   * The kill-switch is checked before every execution.
   * @param {string[]} events - Event names to listen on (e.g. ["market.created"]).
   */
  register(events) {
    for (const event of events) {
      eventBus.on(event, async (payload) => {
        // Kill-switch: silently skip if this instance has been stopped
        if (this.killSwitch) {
          logger.info({ bot: this.name, event }, "Bot kill-switch active — skipping");
          return;
        }

        if (!this.shouldTrigger(payload)) return;

        try {
          logger.info({ bot: this.name, event, marketId: payload.marketId }, "Bot triggered");
          await this.execute(payload.marketId, payload);
        } catch (err) {
          logger.error({ bot: this.name, event, err }, "Bot execution error");
        }
      });
    }
    logger.info({ bot: this.name, events }, "Bot registered");
  }
}

module.exports = BotStrategy;
