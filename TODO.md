# Dark Mode Aware Recharts Charts - Implementation TODO

Current progress: 0/18 ✅

## Phase 1: Core Hooks & Provider (4 steps)

1. [✅] Create `frontend/src/hooks/useChartColors.ts` - Theme detection hook + MutationObserver + palettes
2. [✅] Create `frontend/src/hooks/__tests__/useChartColors.test.ts` - Unit tests (>90% coverage)
3. [✅] Create `frontend/src/components/ChartThemeProvider.tsx` - Context provider
4. [✅] Create `frontend/src/components/__tests__/ChartThemeProvider.test.tsx` - Provider tests

## Phase 2: Update Chart Components (5 steps)

5. [✅] Update OddsChart.tsx - Replace hardcoded colors with hook values
6. [✅] Update ProbabilityChart.tsx - OUTCOME_COLORS → slices[]
7. [✅] Update PoolOwnershipChart.tsx - SLICE_COLORS → slices/others
8. [✅] Update SimulatorPanel.tsx - BarChart colors + tooltip
9. [✅] Update LPEarningsChart.tsx - Custom SVG earnings color

## Phase 3: Integration & App-Wrapping (3 steps)

10. [✅] Import/use ChartThemeProvider in layout.tsx (app-wide)
11. [✅] Search for other Recharts: Found WhatIfSimulator.tsx BarChart (updated with colors.stake='#6366f1'→indigo, projected='#22c55e'→yes, axis #9ca3af→axis, tooltip #1f2937→tooltipBg)
12. [✅] All Recharts charts updated

## Phase 4: Testing & Polish (4 steps)

13. [ ] Run tests: `cd frontend && npm test` - Fix failures
14. [ ] Run lint: `cd frontend && npm run lint -- --fix`
15. [ ] Manual test: Theme toggle + chart reactivity/accessibility
16. [ ] Update this TODO.md with ✓ for completed steps

## Phase 5: Finalization (2 steps)

17. [ ] Verify DoD: No hardcoded colors, instant updates, tests >90%, dark/light accessible
18. [ ] attempt_completion with demo command

**Notes**:

- Provider app-wide preferred (layout.tsx).
- Colors finalized as planned.
- Progress updates after each step.
