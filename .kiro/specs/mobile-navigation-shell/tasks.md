# Implementation Plan

- [x] 1. Set up branch, install fast-check, and scaffold component files
  - Checkout branch `feat/mobile-navigation-shell`
  - Install `fast-check` as a dev dependency in the frontend package
  - Create empty component files: `BottomNavBar.tsx`, `FloatingBetButton.tsx`, `TradeDrawer.tsx`, `PullToRefresh.tsx`, `MobileShell.tsx`
  - _Requirements: 1.1, 2.1, 3.1, 4.1_

- [x] 2. Implement BottomNavBar component
- [x] 2.1 Build BottomNavBar with 4 tabs and safe-area support
  - Render Home, Search, Portfolio, Profile tabs with SVG icons and labels
  - Apply `fixed bottom-0` positioning and `pb-[env(safe-area-inset-bottom)]`
  - Highlight active tab with `text-blue-400` and bottom border indicator
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.2_

- [ ]* 2.2 Write unit tests for BottomNavBar
  - Assert all 4 tabs render with correct labels
  - Assert active tab has active styling applied
  - _Requirements: 1.1, 1.2_

- [ ]* 2.3 Write property test for BottomNavBar active tab exclusivity
  - **Property 1: Active tab exclusivity**
  - **Validates: Requirements 1.2, 1.5**

- [ ] 3. Implement FloatingBetButton component
- [x] 3.1 Build FloatingBetButton with disabled and hidden states
  - Render 56×56px circular button centered above nav bar
  - Apply `opacity-40 pointer-events-none` when `activeMarket` is null
  - Apply `opacity-0 pointer-events-none` when `drawerOpen` is true
  - Add `transition-opacity duration-200`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]* 3.2 Write property test for FAB disabled state
  - **Property 2: FAB disabled when no active market**
  - **Validates: Requirements 2.3**

- [ ]* 3.3 Write property test for FAB hidden when drawer open
  - **Property 3: FAB hidden when drawer is open**
  - **Validates: Requirements 2.5**

- [ ] 4. Implement TradeDrawer with swipe-to-close
- [x] 4.1 Build TradeDrawer bottom sheet with drag handle
  - Render fixed bottom sheet with `max-h-[80vh]`, backdrop overlay
  - Add 32×4px drag handle pill at top center
  - Apply `pb-[env(safe-area-inset-bottom)]` to inner content
  - _Requirements: 3.4, 5.3_

- [x] 4.2 Implement swipe-to-close gesture logic
  - Track `touchstart`/`touchmove`/`touchend` on the drag handle
  - Apply `transform: translateY(${dragY}px)` during drag
  - On release: if dragY > 30% of drawer height → call `onClose`; else snap back
  - Restore FAB visibility on close
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [ ]* 4.3 Write property test for drawer close threshold
  - **Property 4: Drawer close on sufficient drag**
  - **Validates: Requirements 3.2**

- [ ]* 4.4 Write property test for drawer snap-back
  - **Property 5: Drawer snap-back on insufficient drag**
  - **Validates: Requirements 3.3**

- [ ]* 4.5 Write property test for FAB restored after drawer close
  - **Property 6: FAB restored after drawer close**
  - **Validates: Requirements 3.5**

- [ ] 5. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement PullToRefresh component
- [x] 6.1 Build PullToRefresh gesture wrapper
  - Track `touchstart`/`touchmove`/`touchend` on the scroll container
  - Show spinner when pull distance > 0
  - Trigger `onRefresh` when pull distance >= 60px
  - Prevent concurrent refreshes via `isRefreshing` flag
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ]* 6.2 Write property test for pull-to-refresh threshold
  - **Property 7: Pull-to-refresh threshold**
  - **Validates: Requirements 4.2**

- [ ]* 6.3 Write property test for refresh idempotence
  - **Property 8: Refresh idempotence**
  - **Validates: Requirements 4.4**

- [-] 7. Assemble MobileShell and wire into page.tsx
- [x] 7.1 Build MobileShell wrapper component
  - Own `activeTab`, `activeMarket`, `drawerOpen` state
  - Render BottomNavBar, FloatingBetButton, TradeDrawer as children
  - Apply `pt-[env(safe-area-inset-top)]` to top-level container
  - _Requirements: 1.5, 2.2, 5.1_

- [x] 7.2 Integrate MobileShell and PullToRefresh into page.tsx
  - Replace existing top nav with MobileShell on mobile viewports
  - Wrap market list with PullToRefresh
  - Wire `activeMarket` from market card selection to FAB
  - _Requirements: 1.3, 2.2, 4.1_

- [ ] 8. Add mini-README for Thumb-Zone mapping
  - Create `frontend/src/components/mobile/README.md`
  - Document the Thumb-Zone layout rationale and safe-area strategy
  - Include Figma link placeholder
  - _Requirements: all_

- [ ] 9. Final Checkpoint — Ensure all tests pass, ask the user if questions arise.
