# Mobile Navigation Shell — Thumb-Zone Design

## Thumb-Zone Mapping

The "Thumb Zone" is the region of a mobile screen comfortably reachable by the right thumb when holding the phone single-handed. Research (Steven Hoober, 2013) shows this zone covers roughly the **lower 60% of the screen**, centered and slightly left of center.

### Layout Decisions

| Element | Position | Thumb-Zone Rationale |
|---|---|---|
| Bottom Nav Bar | Fixed `bottom-0` | Deepest thumb-reachable zone — all 4 tabs within easy reach |
| Floating Bet Button (FAB) | `bottom: 72px + safe-area` (centered) | Sits just above the nav bar, center-screen — peak thumb comfort |
| Trade Drawer handle | Top of bottom sheet | User pulls *down* to close — natural thumb motion |
| Pull-to-Refresh | Triggered at 60px pull | Requires intentional gesture, not accidental |

### Safe Area Compliance

All shell components use CSS `env()` variables to respect device hardware:

- `padding-top: env(safe-area-inset-top)` — top-level shell container (notch/status bar)
- `padding-bottom: env(safe-area-inset-bottom)` — Bottom Nav Bar (home indicator bar)
- `padding-bottom: env(safe-area-inset-bottom)` — Trade Drawer inner content

This ensures no interactive element is obscured on iPhone X+, Android notch devices, or devices with gesture navigation bars.

### Swipe Gestures

- **Swipe to Close (Trade Drawer):** Touch the drag handle and pull down. If drag exceeds 30% of drawer height on release, the drawer closes. Otherwise it snaps back open.
- **Pull to Refresh:** Pull down from the top of the market list. A spinner appears at >0px pull. Refresh triggers at ≥60px.

---

## Figma Design Link

> **[INSERT FIGMA LINK HERE]** — Add your Figma prototype link before opening the PR.

---

## Components

- `BottomNavBar.tsx` — 4-tab fixed nav (Home, Search, Portfolio, Profile)
- `FloatingBetButton.tsx` — FAB above nav bar, opens trade drawer
- `TradeDrawer.tsx` — Bottom sheet with swipe-to-close gesture
- `PullToRefresh.tsx` — Pull-down gesture wrapper for market list
- `MobileShell.tsx` — Orchestrator that wires all components together
