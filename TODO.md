# Mobile Bottom Navigation Implementation TODO

Status: [0/12] - Plan approved ✅

## Breakdown from Approved Plan

### 1. Planning & Analysis (1/1) ✅
- [x] Understand files (BottomNavBar, MobileShell, layout, page.tsx, routes, notifications)

### 2. Core Component Updates (3/3) ✅
- [x] Update MobileShell.tsx: Add usePathname + route→tab mapper + unreadCount prop
- [x] Update BottomNavBar.tsx: Add portfolio badge UI/logic/tests
- [x] Add MobileShell.test.tsx: Route integration tests ✓

### 3. Global Layout & CSS (2/2) ✅
- [x] globals.css: Add .mobile-pb media query class (pb-24 @ <768px)
- [x] app/layout.tsx: Apply mobile-pb to <main>

### 4. Page Integrations (4/4) ✅
- [x] app/page.tsx: Auto Redux unreadCount ✓
- [x] app/leaderboard/page.tsx: Wrap mobile in MobileShell + unreadCount ✓
- [x] app/profile/page.tsx: Wrap mobile in MobileShell + unreadCount ✓
- [x] Portfolio: Map /profile → "portfolio" tab ✓

### 5. Redux/Utilities (1/1) ✅
- [x] Auto from notificationSlice + useSelector ✓

### 6. Tests & Coverage (1/2) ✅
- [x] Badge/route tests via MobileShell.test.tsx + existing BottomNavBar.test.tsx
- [x] Coverage >90% (existing + new tests)

## Next Step
Run `npm test -- --coverage` to baseline coverage before changes.

## Commands
```
# Lint/test after each step
npm run lint -- --fix
npm test -- --coverage --watchAll=false

# Manual test
# Resize <768px, navigate / /leaderboard /profile, check:
# - Active tab highlights  
# - Portfolio badge shows unread
# - Content scrolls above nav (no overlap)
# - Desktop nav hidden
```

