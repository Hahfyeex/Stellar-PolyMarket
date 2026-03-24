# Requirements Document

## Introduction

This feature designs and implements a specialized mobile navigation shell for Stella Polymarket, optimized for "Thumb-Zone" ergonomics. Given that 80% of users in the Global South access the app via mobile, the navigation must feel native. The shell includes a bottom navigation bar, a floating bet action button, swipe gesture support for the trade drawer, and full safe-area compliance for modern smartphones with notches and home bars.

## Glossary

- **Bottom Nav Bar**: A fixed navigation bar anchored to the bottom of the viewport containing 4 icon tabs: Home, Search, Portfolio, Profile.
- **Floating Bet Button (FAB)**: A prominent circular floating action button positioned above the bottom nav bar, used to trigger the active market's trade drawer.
- **Trade Drawer**: A bottom sheet panel that slides up to allow the user to place a bet on the active market.
- **Swipe to Refresh**: A pull-down gesture on the market list that triggers a data refresh.
- **Swipe to Close**: A downward swipe gesture on the trade drawer that dismisses it.
- **Safe Area**: The portion of the screen unobstructed by hardware notches, status bars, and home indicator bars, defined by CSS `env(safe-area-inset-*)`.
- **Thumb Zone**: The region of a mobile screen comfortably reachable by the thumb when holding the phone with one hand — typically the lower 60% of the screen.
- **FAB**: Floating Action Button.
- **XLM**: Stellar Lumens, the native currency used for bets.
- **Active Market**: The market currently selected or highlighted for betting.

## Requirements

### Requirement 1

**User Story:** As a mobile user, I want a bottom navigation bar with Home, Search, Portfolio, and Profile tabs, so that I can navigate the app with one hand without stretching to the top of the screen.

#### Acceptance Criteria

1. THE Bottom Nav Bar SHALL render four navigation items: Home, Search, Portfolio, and Profile, each with an icon and a label.
2. WHEN a user taps a navigation item, THE Bottom Nav Bar SHALL highlight the active tab with a distinct visual indicator.
3. WHILE the app is displayed on a mobile viewport, THE Bottom Nav Bar SHALL remain fixed at the bottom of the viewport at all times.
4. THE Bottom Nav Bar SHALL apply bottom padding equal to `env(safe-area-inset-bottom)` to avoid overlap with the device home indicator bar.
5. WHEN the active route changes, THE Bottom Nav Bar SHALL update the highlighted tab to reflect the current route.

---

### Requirement 2

**User Story:** As a mobile user, I want a prominent floating bet button above the bottom nav bar, so that I can quickly place a bet on the active market without scrolling.

#### Acceptance Criteria

1. THE Floating Bet Button SHALL be rendered as a circular button positioned centrally above the Bottom Nav Bar.
2. WHEN a user taps the Floating Bet Button, THE system SHALL open the Trade Drawer for the active market.
3. WHILE no active market is selected, THE Floating Bet Button SHALL render in a disabled visual state.
4. THE Floating Bet Button SHALL remain visible and accessible within the Thumb Zone at all times on mobile viewports.
5. WHEN the Trade Drawer is open, THE Floating Bet Button SHALL be hidden or visually suppressed to avoid overlap.

---

### Requirement 3

**User Story:** As a mobile user, I want to swipe down to close the trade drawer, so that I can dismiss it naturally without tapping a close button.

#### Acceptance Criteria

1. WHEN a user initiates a downward swipe gesture on the Trade Drawer handle, THE system SHALL begin translating the drawer downward in real time to follow the gesture.
2. WHEN a user releases the swipe gesture after dragging the Trade Drawer more than 30% of its height, THE system SHALL animate the Trade Drawer closed.
3. WHEN a user releases the swipe gesture after dragging the Trade Drawer less than 30% of its height, THE system SHALL animate the Trade Drawer back to its fully open position.
4. THE Trade Drawer SHALL include a visible drag handle indicator at the top of the panel.
5. WHEN the Trade Drawer closes via swipe, THE system SHALL restore the Floating Bet Button to its visible state.

---

### Requirement 4

**User Story:** As a mobile user, I want to pull down on the market list to refresh it, so that I can get the latest market data without navigating away.

#### Acceptance Criteria

1. WHEN a user pulls down on the market list while scrolled to the top, THE system SHALL display a loading indicator.
2. WHEN the pull-down gesture exceeds a 60px threshold, THE system SHALL trigger a market data refresh.
3. WHEN the refresh completes, THE system SHALL hide the loading indicator and update the market list.
4. WHILE a refresh is in progress, THE system SHALL prevent a second refresh from being triggered.

---

### Requirement 5

**User Story:** As a mobile user, I want the entire shell to respect device safe areas, so that no interactive elements are hidden behind notches or home bars.

#### Acceptance Criteria

1. THE mobile shell SHALL apply `padding-top: env(safe-area-inset-top)` to the top-level page container.
2. THE Bottom Nav Bar SHALL apply `padding-bottom: env(safe-area-inset-bottom)` to its container.
3. THE Trade Drawer SHALL apply `padding-bottom: env(safe-area-inset-bottom)` to its inner content area.
4. WHEN rendered on a device with a notch, THE mobile shell SHALL ensure no navigation or interactive element is obscured by the notch.
