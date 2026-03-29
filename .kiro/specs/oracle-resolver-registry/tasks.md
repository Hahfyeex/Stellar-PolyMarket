# Implementation Plan

- [x] 1. Create `oracle/registry.js` with Map-based resolver registry
  - Define `resolverRegistry` as a `Map`
  - Implement `registerResolver(categorySlug, resolverFn)` with TypeError validation
  - Implement `getResolver(categorySlug)` returning the resolver or undefined
  - Implement `getRegistry()` for test inspection
  - Export all three functions
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Refactor `oracle/index.js` to use registry
  - Import `registerResolver` and `getResolver` from `./registry`
  - Register built-in resolvers at module load: crypto, economics, sports, football
  - Replace `fetchOutcome` keyword matching with `resolveMarket` slug lookup
  - Throw descriptive error for unregistered slugs, route to `markUnresolvable`
  - Export `registerResolver` for external use
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3_

- [x] 3. Write unit tests in `oracle/resolver-registry.test.js`
  - Registry is a Map instance after module load
  - All four built-in slugs are registered on load
  - `registerResolver` is exported as a function
  - Unregistered slug causes `markUnresolvable` to be called (not UPDATE markets)
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [-] 4. Write property-based tests in `oracle/resolver-registry.property.test.js`
  - P1: Register round-trip
  - P2: Overwrite replaces previous resolver
  - P3: Invalid inputs throw TypeError
  - P4: resolveMarket routes by category_slug
  - P5: category fallback when category_slug absent
  - P6: Missing resolver throws with slug in message
  - P7: Failed resolution does not mark market as resolved
  - _Requirements: 6.5 (≥95% coverage)_

- [ ] 5. Update coverage threshold in oracle/package.json to 95%
  - _Requirements: 6.5_
