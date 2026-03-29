# Requirements Document

## Introduction

The oracle currently uses a static object (`REGISTRY`) in `oracles/index.js` to map category strings to resolver functions. While this is already a registry pattern, it is not extensible at runtime — adding a new resolver type requires editing the core oracle file directly. This feature formalises the registry into a proper module with a public `registerResolver` API, category-slug-based lookup, and a well-defined error path (pending review queue) for markets whose category has no registered resolver.

## Glossary

- **Oracle**: The subsystem responsible for determining the winning outcome of an expired prediction market.
- **Resolver**: An async function with the signature `(market) => Promise<number>` that returns the winning outcome index (0-based) for a given market.
- **Registry**: The `resolverRegistry` Map that stores the mapping from category slug to resolver function.
- **Category_Slug**: A lowercase string identifier stored in `market.category_slug` (e.g. `"crypto"`, `"sports"`, `"weather"`).
- **Pending_Review_Queue**: The `dead_letter_queue` database table where markets that cannot be automatically resolved are stored for manual review.
- **Resolution_Loop**: The `checkExpiredMarkets` function in `workers/resolver.js` that polls for expired markets and triggers resolution.

## Requirements

### Requirement 1: Resolver Registry Initialisation

**User Story:** As a backend developer, I want built-in resolvers to be registered automatically on startup, so that existing crypto and financial markets continue to resolve without any configuration change.

#### Acceptance Criteria

1. THE Registry SHALL be implemented as a `Map` where keys are category slug strings and values are resolver functions.
2. WHEN the oracle module is loaded, THE Registry SHALL contain an entry mapping `"crypto"` to the `resolveCryptoPrice` resolver.
3. WHEN the oracle module is loaded, THE Registry SHALL contain an entry mapping `"economics"` to the `resolveCryptoPrice` resolver.
4. WHEN the oracle module is loaded, THE Registry SHALL contain an entry mapping `"sports"` to the `resolveSports` resolver.
5. WHEN the oracle module is loaded, THE Registry SHALL contain an entry mapping `"football"` to the `resolveSports` resolver.

---

### Requirement 2: Dynamic Resolver Registration

**User Story:** As a backend developer, I want a `registerResolver` function, so that I can add new resolver types (e.g. weather, elections) without modifying the core resolution loop.

#### Acceptance Criteria

1. THE Registry SHALL expose a `registerResolver(categorySlug, resolverFn)` function.
2. WHEN `registerResolver` is called with a valid category slug string and a function, THE Registry SHALL store the resolver under that slug.
3. WHEN `registerResolver` is called with a slug that already exists, THE Registry SHALL overwrite the existing resolver with the new one.
4. IF `registerResolver` is called with a non-string `categorySlug`, THEN THE Registry SHALL throw a `TypeError` with a descriptive message.
5. IF `registerResolver` is called with a non-function `resolverFn`, THEN THE Registry SHALL throw a `TypeError` with a descriptive message.

---

### Requirement 3: Category Slug Lookup in Resolution Loop

**User Story:** As a backend developer, I want the resolution loop to look up resolvers by `market.category_slug`, so that routing is data-driven and does not require keyword matching in core code.

#### Acceptance Criteria

1. WHEN `resolveMarket` is called with a market object, THE Resolution_Loop SHALL look up the resolver using `market.category_slug` (lowercased) as the key.
2. WHEN a resolver is found for the category slug, THE Resolution_Loop SHALL invoke that resolver with the market object and return its result.
3. IF `market.category_slug` is absent or `null`, THEN THE Resolution_Loop SHALL fall back to `market.category` (lowercased) for the lookup.

---

### Requirement 4: Pending Review on Missing Resolver

**User Story:** As an operator, I want markets with unregistered category slugs to be pushed to the pending review queue with a descriptive error, so that no market silently fails to resolve.

#### Acceptance Criteria

1. IF no resolver is registered for the market's category slug, THEN THE Resolution_Loop SHALL throw an `Error` whose message includes the unrecognised category slug.
2. WHEN `resolveMarket` throws due to a missing resolver, THE Resolution_Loop SHALL insert the market into the Pending_Review_Queue with the error message.
3. WHEN a market is inserted into the Pending_Review_Queue, THE Resolution_Loop SHALL log a warning that includes the market ID and the unrecognised category slug.
4. WHEN a market is inserted into the Pending_Review_Queue, THE Resolution_Loop SHALL NOT mark the market as resolved in the `markets` table.

---

### Requirement 5: Extensibility Without Core Changes

**User Story:** As a backend developer, I want to register a new resolver by calling `registerResolver` from an external module, so that the core resolution loop never needs to be modified to support new market categories.

#### Acceptance Criteria

1. WHEN a new resolver is registered via `registerResolver` before `resolveMarket` is called, THE Resolution_Loop SHALL use the newly registered resolver for markets with the matching category slug.
2. THE Resolution_Loop SHALL NOT contain any `if`/`switch` branching on category slug values.
3. WHERE a plugin or feature module calls `registerResolver`, THE Registry SHALL make the resolver available to all subsequent `resolveMarket` calls in the same process.

---

### Requirement 6: Unit Test Coverage

**User Story:** As a developer, I want comprehensive unit tests for the registry, so that regressions are caught automatically.

#### Acceptance Criteria

1. THE Test_Suite SHALL include a test that verifies a registered resolver is invoked when `resolveMarket` is called with the matching category slug.
2. THE Test_Suite SHALL include a test that verifies `resolveMarket` throws a descriptive error when called with an unregistered category slug.
3. THE Test_Suite SHALL include a test that verifies a resolver registered via `registerResolver` is callable and returns the expected outcome.
4. THE Test_Suite SHALL include a test that verifies `registerResolver` throws a `TypeError` when passed a non-function resolver.
5. THE Test_Suite SHALL achieve a line coverage of 95% or greater across all oracle registry source files.
