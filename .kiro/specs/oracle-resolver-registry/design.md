# Design Document: Oracle Resolver Registry

## Overview

The oracle resolver registry formalises the existing static `REGISTRY` object in `oracles/index.js` into a proper `Map`-based module with a public `registerResolver` API. The goal is to make resolver routing fully data-driven: the resolution loop looks up a resolver by `market.category_slug` (or falls back to `market.category`) with no `if`/`switch` branching on category values. Markets whose category has no registered resolver are pushed to the `dead_letter_queue` for manual review.

The change is backward-compatible — existing `crypto`, `economics`, `sports`, and `football` categories continue to resolve without any configuration change.

---

## Architecture

```mermaid
flowchart TD
    A[checkExpiredMarkets] -->|for each market| B[resolveMarket]
    B --> C{registry.get\ncategory_slug}
    C -->|resolver found| D[resolverFn(market)]
    D --> E[UPDATE markets SET resolved=true]
    C -->|no resolver| F[throw Error: unrecognised slug]
    F --> G[deadLetter: INSERT dead_letter_queue]
```

The registry module (`oracles/registry.js`) is the single source of truth for slug → resolver mappings. `oracles/index.js` imports from it and re-exports `resolveMarket` and `registerResolver` for backward compatibility. The worker (`workers/resolver.js`) is unchanged — it still calls `resolveMarket` from `oracles`.

---

## Components and Interfaces

### `oracles/registry.js` (new file)

Owns the `resolverRegistry` Map and exposes two functions:

```js
// Internal Map — not exported directly
const resolverRegistry = new Map();

// Register a resolver for a category slug
function registerResolver(categorySlug, resolverFn): void

// Look up a resolver; returns undefined if not found
function getResolver(categorySlug): Function | undefined

// Expose the Map for inspection in tests
function getRegistry(): Map
```

**`registerResolver(categorySlug, resolverFn)`**
- Throws `TypeError` if `categorySlug` is not a string.
- Throws `TypeError` if `resolverFn` is not a function.
- Overwrites any existing entry for the same slug (idempotent registration).
- Stores the resolver under the exact slug string provided (callers are responsible for normalising case before calling).

### `oracles/index.js` (modified)

Replaces the static `REGISTRY` object with imports from `registry.js`. Registers built-in resolvers at module load time. Exports `resolveMarket` and `registerResolver`.

```js
// Built-in registrations (run at module load)
registerResolver('crypto',    priceOracle.resolve);
registerResolver('economics', priceOracle.resolve);
registerResolver('sports',    sportsOracle.resolve);
registerResolver('football',  sportsOracle.resolve);

// resolveMarket — slug-based lookup, no branching
async function resolveMarket(market): Promise<number>
```

**`resolveMarket(market)` lookup order:**
1. Normalise: `slug = (market.category_slug || market.category || '').toLowerCase()`
2. `resolver = getResolver(slug)`
3. If no resolver → throw `Error(\`No resolver registered for category: "${slug}"\`)`
4. Return `resolver(market)`

### `workers/resolver.js` (unchanged)

The worker already calls `resolveMarket` and routes failures to `deadLetter`. No changes needed — the new registry is transparent to the worker.

---

## Data Models

### `resolverRegistry` Map

| Key (string) | Value (function) |
|---|---|
| `"crypto"` | `priceOracle.resolve` |
| `"economics"` | `priceOracle.resolve` |
| `"sports"` | `sportsOracle.resolve` |
| `"football"` | `sportsOracle.resolve` |
| `<any slug>` | any `(market) => Promise<number>` |

### Market object (relevant fields)

```ts
{
  id: number,
  question: string,
  category: string,        // legacy field — used as fallback
  category_slug: string,   // preferred lookup key
  end_date: string,
  resolved: boolean,
  outcomes: string[],
}
```

### `dead_letter_queue` row (existing schema, unchanged)

```sql
market_id   INTEGER
oracle_type TEXT     -- stores the unrecognised slug
error       TEXT     -- includes the slug in the message
attempts    INTEGER
```


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Register round-trip

*For any* valid category slug string and any function, calling `registerResolver(slug, fn)` and then `getResolver(slug)` must return the exact same function reference.

**Validates: Requirements 2.2, 5.1, 5.3**

---

### Property 2: Overwrite replaces previous resolver

*For any* category slug and two distinct resolver functions `fn1` and `fn2`, registering `fn1` then registering `fn2` under the same slug must result in `getResolver(slug)` returning `fn2`, not `fn1`.

**Validates: Requirements 2.3**

---

### Property 3: Invalid inputs throw TypeError

*For any* value that is not a string passed as `categorySlug`, or any value that is not a function passed as `resolverFn`, calling `registerResolver` must throw a `TypeError`.

**Validates: Requirements 2.4, 2.5**

---

### Property 4: resolveMarket routes by category_slug

*For any* market object whose `category_slug` matches a registered slug, `resolveMarket(market)` must invoke the registered resolver with that market and return its result — without any branching on the slug value in the resolution loop.

**Validates: Requirements 3.1, 3.2, 5.1**

---

### Property 5: category fallback when category_slug is absent

*For any* market object where `category_slug` is absent or `null`, `resolveMarket` must fall back to `market.category` (lowercased) for the registry lookup, and invoke the resolver registered under that key if one exists.

**Validates: Requirements 3.3**

---

### Property 6: Missing resolver throws with slug in message

*For any* category slug that has no registered resolver, calling `resolveMarket` with a market bearing that slug must throw an `Error` whose message contains the unrecognised slug string.

**Validates: Requirements 4.1**

---

### Property 7: Failed resolution does not mark market as resolved

*For any* market whose category slug has no registered resolver, the `markets` table `UPDATE` query must not be executed — the market must remain unresolved.

**Validates: Requirements 4.4**

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `registerResolver` receives non-string slug | Throws `TypeError("categorySlug must be a string, got <type>")` |
| `registerResolver` receives non-function resolver | Throws `TypeError("resolverFn must be a function, got <type>")` |
| `resolveMarket` called with unregistered slug | Throws `Error("No resolver registered for category: \"<slug>\"")` |
| `market.category_slug` is null/undefined | Falls back to `market.category`; if that is also missing, slug becomes `""` and throws as unregistered |
| Resolver function throws internally | Error propagates to `resolveWithRetry` in the worker, which retries up to 3 times then calls `deadLetter` |
| `deadLetter` insert fails | Worker logs the DB error; market remains unresolved for the next poll cycle |

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. Unit tests cover specific examples and integration points; property tests verify universal correctness across generated inputs.

### Property-Based Testing Library

Use **[fast-check](https://github.com/dubzzz/fast-check)** — a mature JavaScript PBT library compatible with Jest. Install as a dev dependency:

```bash
npm install --save-dev fast-check
```

Each property test runs a minimum of **100 iterations** (fast-check default is 100; set explicitly via `{ numRuns: 100 }`).

### Tag Format

Every property test must include a comment referencing the design property:

```js
// Feature: oracle-resolver-registry, Property <N>: <property_text>
```

### Unit Tests (`resolver-registry.test.js`)

Focus on specific examples and integration:

- Registry is a `Map` instance after module load
- All four built-in slugs (`crypto`, `economics`, `sports`, `football`) are registered on load
- `registerResolver` is exported as a function
- `deadLetter` is called (not `UPDATE markets`) when `resolveMarket` throws for an unregistered slug (integration with worker)
- Logger `warn` is called with market ID and slug when a market is dead-lettered

### Property Tests (`resolver-registry.property.test.js`)

One property-based test per design property:

| Test | Property | Arbitraries |
|---|---|---|
| Register round-trip | P1 | `fc.string()` for slug, `fc.func(fc.integer())` for resolver |
| Overwrite replaces | P2 | `fc.string()` for slug, two `fc.func()` for resolvers |
| Invalid inputs throw TypeError | P3 | `fc.anything().filter(v => typeof v !== 'string')` for slug; `fc.anything().filter(v => typeof v !== 'function')` for fn |
| resolveMarket routes by slug | P4 | `fc.string()` for slug, `fc.func(fc.integer({min:0,max:1}))` for resolver, market object with matching slug |
| category fallback | P5 | `fc.string()` for category, market with `category_slug: null` |
| Missing resolver throws with slug | P6 | `fc.string()` for unregistered slug |
| No UPDATE on failure | P7 | `fc.string()` for unregistered slug; assert `db.query` not called with `UPDATE markets` |

### Coverage Target

Line coverage ≥ 95% across `oracles/registry.js` and the modified `oracles/index.js`, enforced via Jest's `--coverage` flag and a `coverageThreshold` entry in `jest.config.js` (or `package.json`):

```json
"jest": {
  "coverageThreshold": {
    "global": { "lines": 95 }
  }
}
```
