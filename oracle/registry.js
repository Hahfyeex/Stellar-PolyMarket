"use strict";

/**
 * Oracle Resolver Registry
 *
 * A Map-based registry that maps category slugs to resolver functions.
 * Resolvers are registered at module load time (built-ins) or dynamically
 * via registerResolver(). The resolution loop uses getResolver() to look up
 * the correct resolver by market.category_slug — no if/switch branching needed.
 */

const resolverRegistry = new Map();

/**
 * Register a resolver function for a category slug.
 * Overwrites any existing resolver for the same slug.
 *
 * @param {string} categorySlug - The category slug key (e.g. "crypto", "sports")
 * @param {Function} resolverFn - Async function (market) => Promise<number>
 * @throws {TypeError} if categorySlug is not a string
 * @throws {TypeError} if resolverFn is not a function
 */
function registerResolver(categorySlug, resolverFn) {
  if (typeof categorySlug !== "string") {
    throw new TypeError(
      `categorySlug must be a string, got ${typeof categorySlug}`
    );
  }
  if (typeof resolverFn !== "function") {
    throw new TypeError(
      `resolverFn must be a function, got ${typeof resolverFn}`
    );
  }
  resolverRegistry.set(categorySlug, resolverFn);
}

/**
 * Look up a resolver by category slug.
 *
 * @param {string} categorySlug
 * @returns {Function|undefined} the registered resolver, or undefined if not found
 */
function getResolver(categorySlug) {
  return resolverRegistry.get(categorySlug);
}

/**
 * Return the underlying Map for inspection (tests only).
 *
 * @returns {Map}
 */
function getRegistry() {
  return resolverRegistry;
}

module.exports = { registerResolver, getResolver, getRegistry };
