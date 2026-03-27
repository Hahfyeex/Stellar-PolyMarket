import os

d = "scripts/issue-bodies"
os.makedirs(d, exist_ok=True)

issues = {}

issues[122] = """**Type:** UIUX

## Figma Reference
Figma Link: _Add Figma frame link here before starting work_

## Context
In fast-moving markets, users need an immediate visual signal when odds are shifting rapidly. A pulse animation draws attention without requiring constant number-watching.

## Implementation Guide
1. Track previous odds value in a useRef and compare on each update
2. Calculate percentage change: Math.abs((newOdds - prevOdds) / prevOdds * 100)
3. If change exceeds VOLATILITY_THRESHOLD (default 5), add CSS class pulse-green or pulse-red
4. Define @keyframes pulseGreen and @keyframes pulseRed with box-shadow glow
5. Set animation-iteration-count: 3 so it stops after 3 cycles
6. Remove the class after animation ends using onAnimationEnd callback
7. Export VOLATILITY_THRESHOLD as a named constant in constants.ts

## Guidelines
- Pulse animation on market cards when odds change more than 5% within 60 seconds
- CSS @keyframes border or background glow
- Green for rising YES odds, red for falling
- Configurable threshold constant
- Runs 3 cycles then stops
- Key requirement: CSS @keyframes / Color Logic

## Definition of Done
- [ ] Animation triggers correctly when odds change exceeds the configured threshold
- [ ] Green/red color logic is unit tested for both rising and falling scenarios
- [ ] Animation runs exactly 3 cycles and stops
- [ ] Threshold constant is clearly named, documented, and easy to change
- [ ] Animation does not cause layout shift or affect card dimensions
- [ ] Keyframe logic and trigger conditions explained with inline comments
- [ ] Works correctly when multiple cards pulse simultaneously
- [ ] Screenshot showing green and red pulse states attached to PR
- [ ] Figma link added to this issue before PR is opened
- [ ] Adheres to UI color palette (green and red from design tokens)

## PR and Checkout
```bash
git checkout -b feat/122-volatility-pulse
git add .
git commit -m "feat: add high-volatility pulse animation to market cards"
git push origin feat/122-volatility-pulse
```
Open a PR against `main` and include `Closes #122` in the PR description.
"""

issues[123] = """**Type:** UIUX

## Figma Reference
Figma Link: _Add Figma frame link here before starting work_

## Context
In markets with few large stakers, users want to see how the pool is distributed. A fractional ownership chart adds transparency and social context.

## Implementation Guide
1. Fetch all bets for the market from GET /api/markets/:id
2. Group bets by wallet address and sum amounts
3. Calculate each wallet share: (walletTotal / totalPool * 100)
4. Group all wallets below 1% into a single Others entry
5. Render a PieChart from Recharts with Cell components per slice
6. Custom Tooltip showing abbreviated wallet and exact XLM amount
7. Subscribe to WebSocket updates to re-render chart when new bets arrive

## Guidelines
- Pie chart using Recharts on market detail page
- Each slice represents one bettor share of total pool
- Tooltip shows abbreviated wallet and stake amount
- Chart updates live as new bets come in
- Wallets below 1% grouped into Others slice
- Key requirement: Recharts / Fractional Ownership

## Definition of Done
- [ ] Chart renders accurately with slice sizes matching actual pool percentages
- [ ] Tooltip works correctly on hover (desktop) and tap (mobile)
- [ ] Wallets below 1% threshold correctly grouped into Others slice
- [ ] Fractional calculation logic is unit tested at more than 90% coverage
- [ ] Chart updates live when new bets are placed without full page reload
- [ ] Data transformation logic has inline comments
- [ ] Matches color palette with slice colors from design tokens
- [ ] Screenshot of chart with tooltip visible attached to PR
- [ ] Figma link added to this issue before PR is opened
- [ ] README documents the data structure expected from the API

## PR and Checkout
```bash
git checkout -b feat/123-share-pizza-chart
git add .
git commit -m "feat: add fractional ownership pie chart to market detail"
git push origin feat/123-share-pizza-chart
```
Open a PR against `main` and include `Closes #123` in the PR description.
"""

issues[124] = """**Type:** UIUX

## Figma Reference
Figma Link: _Add Figma frame link here before starting work_

## Context
Users need a way to discover new markets relevant to their interests. Generic lists do not drive engagement. Personalized, visually rich cards do.

## Implementation Guide
1. Create a MarketDiscoveryCard component accepting market data as props
2. Add SVG illustrations per category in /public/categories/
3. Suggestion logic: score markets by (userCategoryMatches * 2) + (volumeLast24h / 1000)
4. Sort by score descending and render top 6 on homepage
5. Hover effect: transform translateY(-4px) plus box-shadow increase on hover
6. Hot badge: show if market volume increased more than 20% in last hour
7. Fetch user category history from GET /api/users/:wallet/activity

## Guidelines
- SVG category illustrations for Sports, Crypto, Finance, Politics, Weather
- Suggestion logic based on user past activity or trending volume
- Hover lift effect using CSS transform and box-shadow
- Market end date, pool size, and category tag on each card
- Trending markets show a Hot badge
- Key requirement: SVG Illustrations / Suggestion Logic

## Definition of Done
- [ ] All 5 category SVG illustrations implemented and render at correct sizes
- [ ] Suggestion ranking logic is unit tested at more than 90% coverage
- [ ] Hover lift effect works on desktop and does not trigger on mobile scroll
- [ ] Market end date, pool size, and category tag all display correctly
- [ ] Hot badge appears only on markets meeting the trending threshold
- [ ] Suggestion logic documented with inline comments explaining ranking algorithm
- [ ] Cards adhere to spacing system and color palette
- [ ] Screenshot of discovery cards grid with hover state attached to PR
- [ ] Figma link added to this issue before PR is opened
- [ ] README documents how to add new categories and extend suggestion logic

## PR and Checkout
```bash
git checkout -b feat/124-market-discovery-cards
git add .
git commit -m "feat: add personalized market discovery cards with SVG illustrations"
git push origin feat/124-market-discovery-cards
```
Open a PR against `main` and include `Closes #124` in the PR description.
"""

issues[125] = """**Type:** UIUX

## Figma Reference
Figma Link: _Add Figma frame link here before starting work_

## Context
Users miss critical events like market resolution and payouts because there is no in-app alert system. A notification inbox keeps users informed and drives them back to claim winnings.

## Implementation Guide
1. Create a NotificationInbox component rendered as a dropdown from a bell icon in the navbar
2. Store notifications in Redux: { id, type, message, read, timestamp }
3. Notification types: MARKET_RESOLVED, PAYOUT_AVAILABLE, MARKET_ENDING_SOON
4. Poll GET /api/notifications/:wallet every 30 seconds or use WebSocket push
5. Set z-index: 1100 on the dropdown container to sit above all modals
6. Blue dot indicator on bell icon when unreadCount > 0
7. Mark as read on click; Clear All dispatches clearAllNotifications Redux action

## Guidelines
- Notification dropdown from navbar
- Types: Market Resolved, Payout Available, Market Ending in 1 Hour
- z-index 1100 to sit above all modals
- Read/unread state with blue dot indicator
- Clear All button
- Key requirement: Inbox Logic / Z-index 1100

## Definition of Done
- [ ] All 3 notification types render with correct content and icons
- [ ] Read/unread state persists correctly across page refreshes
- [ ] z-index 1100 verified — dropdown sits above all modals on every page
- [ ] Clear All removes all notifications and updates unread count to 0
- [ ] Unread count badge on navbar icon updates correctly
- [ ] Inbox state management logic is unit tested at more than 90% coverage
- [ ] Inline comments explain notification type handling and state transitions
- [ ] Screenshot of notification inbox open with unread items attached to PR
- [ ] Figma link added to this issue before PR is opened
- [ ] Adheres to color palette and spacing system

## PR and Checkout
```bash
git checkout -b feat/125-priority-notification-inbox
git add .
git commit -m "feat: add priority notification inbox with read/unread state"
git push origin feat/125-priority-notification-inbox
```
Open a PR against `main` and include `Closes #125` in the PR description.
"""

issues[126] = """**Type:** FE

## Context
Every separate contract call requires a Freighter wallet pop-up. Batching multiple calls into one reduces approvals and dramatically improves UX.

## Implementation Guide
1. Create a useBatchTransaction hook that accepts an array of Soroban operations
2. Use Freighter SDK signTransaction with a built TransactionBuilder containing all operations
3. Common batch flows: [placeBet, addTrustline], [placeBet, payFee]
4. On failure, parse the error to identify which operation failed and surface a specific message
5. Export the hook from /hooks/useBatchTransaction.ts for reuse across components
6. Test on Stellar testnet using the Soroban testnet RPC endpoint

## Guidelines
- Freighter SDK atomic transaction bundling
- Batch: bet + trustline, bet + fee approval
- Clean rollback on failure with specific error messages
- Expose useBatchTransaction hook
- Key requirement: Freighter SDK / Atomic Bundling

## Definition of Done
- [ ] Atomic bundling works end-to-end on Stellar testnet with at least 2 operations
- [ ] Failed batch rolls back cleanly with no partial state left on-chain
- [ ] User sees a specific error message identifying which operation failed
- [ ] useBatchTransaction hook is unit tested at more than 90% coverage
- [ ] Hook is reused in at least 2 different components
- [ ] All Freighter SDK interaction logic has inline comments
- [ ] Screenshot of successful batch transaction confirmation attached to PR
- [ ] README updated with hook API, supported batch flows, and testnet instructions

## PR and Checkout
```bash
git checkout -b feat/136-transaction-batching
git add .
git commit -m "feat: implement Freighter SDK atomic transaction batching"
git push origin feat/136-transaction-batching
```
Open a PR against `main` and include `Closes #126` in the PR description.
"""

issues[127] = """**Type:** FE

## Context
Static odds that only update on page refresh make the platform feel outdated. Real-time odds are a core expectation for any prediction market.

## Implementation Guide
1. Create a useOddsStream(marketId) hook that opens a WebSocket to Mercury Indexer
2. On each event, update the odds in local state using useState
3. Flash animation: when value changes, add class flash-update for 500ms then remove it
4. Reconnect logic: use useEffect cleanup to close socket, retry with exponential backoff (1s, 2s, 4s, max 30s)
5. Debounce state updates: use useRef timer to batch rapid events, max 1 update per 500ms
6. Unsubscribe and close socket on component unmount

## Guidelines
- Mercury Indexer WebSocket for live contract event streaming
- Update odds without full re-render
- Yellow flash animation on value change
- Exponential backoff reconnect logic
- Debounce rapid updates to max 1 per 500ms
- Key requirement: Mercury Indexer / WebSockets

## Definition of Done
- [ ] WebSocket connection established and odds update live on testnet
- [ ] Reconnect logic tested by simulating dropped connection — reconnects within 10s
- [ ] Yellow flash animation triggers on value change without layout shift
- [ ] Debounce correctly limits updates to max 1 per 500ms under rapid event bursts
- [ ] Socket lifecycle is unit tested at more than 90% coverage
- [ ] Inline comments explain connection management and backoff algorithm
- [ ] Screenshot of live odds updating in real-time attached to PR
- [ ] README documents the Mercury Indexer event schema consumed

## PR and Checkout
```bash
git checkout -b feat/137-live-odds-sync
git add .
git commit -m "feat: add real-time odds sync via Mercury Indexer WebSocket"
git push origin feat/137-live-odds-sync
```
Open a PR against `main` and include `Closes #127` in the PR description.
"""

issues[128] = """**Type:** FE

## Context
XLM uses 7 decimal precision and market odds can shift between bet submission and confirmation. Without slippage protection users can receive significantly worse payouts.

## Implementation Guide
1. Store odds at time of bet form open in a useRef
2. Before submitting, fetch current odds and compare using BigInt arithmetic
3. Slippage calculation: BigInt(Math.round(drift * 1e7)) > BigInt(Math.round(tolerance * 1e7))
4. Build a SlippageSettings component with 4 preset buttons and a custom input
5. Persist selected tolerance to localStorage key stella_slippage_pref
6. If slippage exceeded, show a SlippageWarningModal with current vs expected payout and Proceed/Cancel buttons

## Guidelines
- BigInt math for all payout calculations
- Slippage tolerance: 0.5%, 1%, 2%, or custom
- Persist preference in localStorage
- Warning modal if drift exceeds tolerance
- Key requirement: BigInt Math / User Presets

## Definition of Done
- [ ] BigInt math used for all payout calculations with zero floating point operations
- [ ] Slippage warning modal triggers correctly when threshold is exceeded
- [ ] All 4 tolerance presets work correctly
- [ ] User preference persists in localStorage and restores on next visit
- [ ] Unit tests cover all calculation paths at more than 90% coverage
- [ ] BigInt conversion and comparison logic explained with inline comments
- [ ] Screenshot of slippage warning modal attached to PR
- [ ] README documents the slippage calculation methodology

## PR and Checkout
```bash
git checkout -b feat/138-client-side-slippage
git add .
git commit -m "feat: implement client-side slippage protection with BigInt math"
git push origin feat/138-client-side-slippage
```
Open a PR against `main` and include `Closes #128` in the PR description.
"""

issues[129] = """**Type:** FE

## Context
Storing full market metadata on-chain is expensive. IPFS allows rich descriptions and source links off-chain while keeping a content hash on-chain for verification.

## Implementation Guide
1. Create useIPFSMetadata(cid) hook using Pinata SDK pinata.gateways.get(cid)
2. Wrap fetch in React Query with staleTime: Infinity for permanent caching
3. Set a 5-second timeout using AbortController — on timeout, fall back to on-chain data
4. Expected JSON schema: { description, category, sourceUrls[], creatorNotes }
5. Render a MetadataUnavailable placeholder component when both IPFS and on-chain fallback fail
6. Cache is automatic via React Query — no duplicate fetches for the same CID

## Guidelines
- useIPFSMetadata(cid) hook using Pinata SDK
- Cache with React Query or SWR
- 5s timeout fallback to on-chain data
- Graceful unavailable state
- Key requirement: Pinata SDK / JSON Metadata Hook

## Definition of Done
- [ ] Hook fetches and returns correct metadata for a valid CID
- [ ] Cache prevents duplicate fetches for the same CID within a session
- [ ] Fallback to on-chain data triggers correctly when IPFS times out after 5s
- [ ] Metadata unavailable UI state renders gracefully without breaking layout
- [ ] Fetch, cache, and fallback logic is unit tested at more than 90% coverage
- [ ] CID resolution and fallback flow explained with inline comments
- [ ] Screenshot of metadata rendering and unavailable state attached to PR
- [ ] README documents the expected JSON metadata schema

## PR and Checkout
```bash
git checkout -b feat/139-ipfs-resolver
git add .
git commit -m "feat: add IPFS metadata resolver hook with Pinata SDK"
git push origin feat/139-ipfs-resolver
```
Open a PR against `main` and include `Closes #129` in the PR description.
"""

issues[130] = """**Type:** FE

## Context
Users frequently lose bet form inputs when accidentally navigating away or refreshing. This leads to abandoned bets and frustration.

## Implementation Guide
1. Create a useFormPersistence(marketId) hook
2. On every form field change, write to localStorage key stella_bet_form_{marketId}
3. On component mount, read from localStorage and populate form state
4. On successful bet submission, call clearPersistedForm(marketId) to remove the key
5. Add a Clear form button that calls clearPersistedForm and resets all fields to defaults
6. Persist: { outcomeIndex, amount, slippageTolerance }

## Guidelines
- Persist selected outcome, stake amount, slippage setting
- Per-market localStorage key for independent state
- Restore on mount, clear on successful submission
- Clear form button for manual reset
- Key requirement: LocalStorage / State Sync

## Definition of Done
- [ ] All 3 fields persist and restore correctly on refresh
- [ ] Different markets have independent persisted state
- [ ] State is cleared automatically after successful bet submission
- [ ] Clear form button resets both UI state and localStorage entry
- [ ] Persist, restore, and clear logic is unit tested at more than 90% coverage
- [ ] localStorage key structure documented with inline comments
- [ ] Screenshot of form restoring state after refresh attached to PR
- [ ] README documents the storage key format and how to clear state for testing

## PR and Checkout
```bash
git checkout -b feat/140-form-persistence
git add .
git commit -m "feat: add localStorage form persistence for bet inputs"
git push origin feat/140-form-persistence
```
Open a PR against `main` and include `Closes #130` in the PR description.
"""

issues[131] = """**Type:** FE

## Context
Markets with hundreds of bets render thousands of DOM nodes causing severe performance degradation on low-end devices common in target markets.

## Implementation Guide
1. Replace the current order book ul with react-window FixedSizeList
2. Set itemSize=48 (row height in px) and height=400 (visible window)
3. Each row renders: abbreviated wallet, outcome badge, XLM amount, relative timestamp
4. For live updates, use a useRef to hold the data array and call listRef.current.resetAfterIndex(0) on update
5. Implement infinite scroll: detect when user scrolls to bottom using onItemsRendered and fetch next page
6. Test with a mock dataset of 500+ rows before connecting to live data

## Guidelines
- react-window FixedSizeList for order book rows
- Dynamic data updates without full list re-render
- Test with 500+ rows
- Infinite scroll at bottom
- Key requirement: react-window / Performance

## Definition of Done
- [ ] List renders 500+ rows without frame drops (verified with Chrome DevTools Performance tab)
- [ ] Scroll remains smooth at 60fps on a mid-range Android device
- [ ] Dynamic data updates append new rows without re-rendering existing ones
- [ ] Infinite scroll trigger loads next page correctly at list bottom
- [ ] Row rendering and update logic is unit tested at more than 90% coverage
- [ ] Virtualization window configuration explained with inline comments
- [ ] Screenshot of order book with 500+ rows scrolling smoothly attached to PR
- [ ] README documents performance benchmarks achieved

## PR and Checkout
```bash
git checkout -b feat/141-virtualized-order-book
git add .
git commit -m "perf: virtualize order book with react-window"
git push origin feat/141-virtualized-order-book
```
Open a PR against `main` and include `Closes #131` in the PR description.
"""

issues[132] = """**Type:** FE

## Context
Users trying to bet with custom Stellar assets fail silently if they do not have the required trustline. This is a common confusion point for non-technical users.

## Implementation Guide
1. Before bet submission, call GET https://horizon-testnet.stellar.org/accounts/:wallet
2. Check balances array for an entry matching asset_code and asset_issuer
3. If not found, show a modal: Your wallet needs to trust [ASSET] before betting
4. Build a trustline transaction using TransactionBuilder with Operation.changeTrust
5. Sign with Freighter and submit to Horizon
6. On success, automatically re-trigger the original bet submission
7. Handle: wallet not connected (show connect prompt), Horizon timeout (show retry)

## Guidelines
- Horizon API check before bet with custom asset
- Auto-construct trustline transaction for one-click Freighter approval
- Resume bet flow after trustline set
- Handle edge cases: wallet not connected, Horizon timeout
- Key requirement: Horizon API / Automatic Tx

## Definition of Done
- [ ] Trustline check runs before every bet involving a custom asset
- [ ] Auto-constructed trustline transaction works correctly on testnet
- [ ] Bet flow resumes automatically after trustline approval
- [ ] Wallet not connected and Horizon timeout edge cases handled gracefully
- [ ] Check, construction, and resume logic is unit tested at more than 90% coverage
- [ ] Horizon API response parsing explained with inline comments
- [ ] Screenshot of trustline prompt and successful flow attached to PR
- [ ] README documents supported assets and the full trustline flow

## PR and Checkout
```bash
git checkout -b feat/142-trustline-auto-checker
git add .
git commit -m "feat: add automatic trustline checker and one-click setup"
git push origin feat/142-trustline-auto-checker
```
Open a PR against `main` and include `Closes #132` in the PR description.
"""

issues[133] = """**Type:** FE

## Context
A large JavaScript bundle means slow initial load times, especially on 3G mobile networks common in African markets. Every KB matters.

## Implementation Guide
1. Run npx @next/bundle-analyzer and screenshot the current bundle breakdown
2. Identify the top 5 largest chunks and plan splits
3. Convert all page-level imports to next/dynamic lazy loading
4. In recharts, import only used components rather than the full package
5. In stellar-sdk, use named imports for tree-shaking
6. Run next build and verify bundle size reduction in the build output

## Guidelines
- Webpack Bundle Analyzer to document current size
- Route-based code splitting with next/dynamic
- Tree-shake Recharts and stellar-sdk
- Split vendor chunks
- Target: initial JS bundle below 200KB gzipped
- Key requirement: Webpack / Tree-shaking / Code-split

## Definition of Done
- [ ] Initial JS bundle is below 200KB gzipped (verified with build output)
- [ ] Bundle analyzer report included as a comment in the PR
- [ ] All lazy-loaded routes work correctly with no hydration errors
- [ ] Before/after bundle size comparison documented in the PR
- [ ] All existing unit tests still pass after refactor at more than 90% coverage
- [ ] Dynamic import decisions explained with inline comments
- [ ] Screenshot of bundle analyzer before and after attached to PR
- [ ] README updated with build optimization notes and how to run the analyzer

## PR and Checkout
```bash
git checkout -b chore/143-bundle-size-audit
git add .
git commit -m "perf: reduce bundle size with code splitting and tree shaking"
git push origin chore/143-bundle-size-audit
```
Open a PR against `main` and include `Closes #133` in the PR description.
"""

issues[134] = """**Type:** FE

## Context
Soroban contract calls can fail for many reasons. Without proper error handling users see cryptic errors or blank screens.

## Implementation Guide
1. Create a ContractErrorBoundary class component extending React.Component
2. In componentDidCatch, dispatch setContractError(error) to Redux and log to Sentry
3. Create an error code map in /constants/contractErrors.ts
4. Render a fallback UI with the mapped message and a Retry button
5. Retry button calls this.setState({ hasError: false }) to re-render the child
6. Wrap every component that calls a Soroban function with ContractErrorBoundary

## Guidelines
- React.ErrorBoundary wrapping all contract interaction components
- Redux-connected error state
- Map contract error codes to user-friendly messages
- Log to monitoring service
- Retry button
- Key requirement: React.ErrorBoundary / Redux

## Definition of Done
- [ ] All contract interaction components wrapped in ErrorBoundary
- [ ] At least 5 common contract error codes mapped to user-friendly messages
- [ ] Errors dispatched to Redux store and visible in Redux DevTools
- [ ] Errors logged to monitoring service with correct context
- [ ] Retry button works and re-attempts the failed operation
- [ ] Error boundary and Redux integration unit tested at more than 90% coverage
- [ ] Error code mapping documented with inline comments
- [ ] Screenshot of error boundary fallback UI attached to PR
- [ ] README documents how to add new error code mappings

## PR and Checkout
```bash
git checkout -b feat/144-contract-error-boundary
git add .
git commit -m "feat: add contract error boundary with user-friendly messages"
git push origin feat/144-contract-error-boundary
```
Open a PR against `main` and include `Closes #134` in the PR description.
"""

issues[135] = """**Type:** FE

## Context
Stella Polymarket targets global and African markets. Supporting local languages dramatically increases accessibility and trust for non-English speakers.

## Implementation Guide
1. Install i18next and react-i18next
2. Create translation files in /public/locales/[lang]/common.json for: en, fr, yo, ha, sw
3. Configure i18next with backend plugin for dynamic JSON loading
4. Replace all hardcoded UI strings with t('key') calls
5. Add a language selector dropdown in the navbar
6. Persist selection to localStorage key stella_lang
7. On first load, detect navigator.language and match to supported locales

## Guidelines
- i18next with dynamic JSON loading
- Priority languages: English, French, Yoruba, Hausa, Swahili
- All UI strings extracted to translation JSON files
- Language selection persists in localStorage
- Respect browser locale on first visit
- Key requirement: i18next / Dynamic JSON Loading

## Definition of Done
- [ ] All 5 priority languages implemented with complete translation JSON files
- [ ] Zero hardcoded UI strings remain — all use i18next translation keys
- [ ] Language selection persists in localStorage and restores on next visit
- [ ] Browser locale correctly detected and applied on first visit
- [ ] Dynamic JSON loading works — only active language file is loaded
- [ ] Translation loading and locale detection logic unit tested at more than 90% coverage
- [ ] Inline comments explain i18next configuration and namespace structure
- [ ] Screenshot of UI in at least 3 different languages attached to PR
- [ ] README documents how to add a new language and contribute translations

## PR and Checkout
```bash
git checkout -b feat/145-i18n-translation
git add .
git commit -m "feat: add i18n support with i18next for 5 languages"
git push origin feat/145-i18n-translation
```
Open a PR against `main` and include `Closes #135` in the PR description.
"""

issues[136] = """**Type:** FE

## Context
Mobile users expect native pull-to-refresh behavior on list views. Without it the only way to get fresh market data is a full page reload.

## Implementation Guide
1. Add touch event listeners: touchstart, touchmove, touchend on the markets list container
2. Track startY on touchstart, calculate pullDistance = currentY - startY on touchmove
3. When pullDistance >= 60 and user releases (touchend), trigger fetchMarkets()
4. Show a spinner at the top of the list during re-fetch
5. Prevent default scroll behavior only when pull is active to avoid conflicting with normal scroll

## Guidelines
- Pull-to-refresh gesture on markets list
- Touch event listeners or react-pull-to-refresh
- Re-fetch markets list with loading spinner
- Must not conflict with normal scroll
- Minimum pull distance: 60px
- Key requirement: Swipe Gestures / List Re-fetch

## Definition of Done
- [ ] Pull-to-refresh triggers correctly after 60px pull distance on mobile
- [ ] Does not interfere with normal vertical scrolling behavior
- [ ] Loading spinner appears during re-fetch and disappears on completion
- [ ] Markets list updates correctly with fresh data after trigger
- [ ] Gesture and re-fetch logic unit tested at more than 90% coverage
- [ ] Touch event handling explained with inline comments
- [ ] Screenshot of pull-to-refresh in action on mobile attached to PR
- [ ] Tested on both iOS Safari and Android Chrome

## PR and Checkout
```bash
git checkout -b feat/146-pull-to-refresh
git add .
git commit -m "feat: add mobile pull-to-refresh on markets list"
git push origin feat/146-pull-to-refresh
```
Open a PR against `main` and include `Closes #136` in the PR description.
"""

issues[137] = """**Type:** FE

## Context
Loading spinners cause layout shift and feel jarring. Skeleton screens that match the layout of loading content improve perceived performance significantly.

## Implementation Guide
1. Create a Skeleton base component with a CSS shimmer animation using @keyframes shimmer
2. Build layout-specific skeletons: MarketCardSkeleton, OrderBookRowSkeleton, PortfolioSkeleton
3. Each skeleton must match the exact dimensions of the real component it replaces
4. Replace all isLoading ? Spinner : Component patterns with skeleton equivalents
5. Use min-height on containers to prevent CLS when content loads in
6. Shimmer CSS: background linear-gradient animated with background-size: 200%

## Guidelines
- CSS shimmer skeleton screens replacing all spinners
- Skeletons match exact layout of market cards, order book rows, portfolio
- Consistent shimmer animation timing
- Zero CLS when content loads in
- Key requirement: CSS Shimmers / Layout Stability

## Definition of Done
- [ ] All loading spinners replaced with skeleton screens across the app
- [ ] Skeleton layouts match exact dimensions of target components
- [ ] CLS score is 0 when content loads in (verified with Lighthouse)
- [ ] Shimmer animation timing is consistent across all skeletons
- [ ] Skeleton components unit tested at more than 90% coverage
- [ ] Shimmer CSS animation explained with inline comments
- [ ] Screenshot of skeleton states for all 3 component types attached to PR
- [ ] README documents the skeleton component API and how to create new ones

## PR and Checkout
```bash
git checkout -b feat/147-skeleton-loading-states
git add .
git commit -m "feat: replace spinners with CSS shimmer skeleton loading states"
git push origin feat/147-skeleton-loading-states
```
Open a PR against `main` and include `Closes #137` in the PR description.
"""

issues[138] = """**Type:** FE

## Context
Wallet addresses and transaction IDs are long and unwieldy. Users need a quick way to copy them without selecting text manually.

## Implementation Guide
1. Create a reusable CopyButton component accepting a value prop
2. Display abbreviated format: value.slice(0,6) + '...' + value.slice(-4)
3. On click, call navigator.clipboard.writeText(value)
4. Show a Copied! tooltip using useState flag, auto-reset after 2000ms with setTimeout
5. Fallback for unsupported browsers: create a hidden textarea, select it, and call document.execCommand('copy')
6. Add aria-label="Copy address" and keyboard support (Enter/Space triggers copy)

## Guidelines
- Reusable CopyButton component
- Abbreviated format: first 6 + last 4 chars
- Clipboard API with graceful fallback
- Copied! tooltip fades after 2 seconds
- Key requirement: Address/TxID Abbreviation + Copy

## Definition of Done
- [ ] CopyButton component is reusable and accepts any string value as a prop
- [ ] Abbreviation format is correct: first 6 + last 4 chars with ellipsis
- [ ] Full value copied to clipboard correctly on click
- [ ] Copied! tooltip appears and fades after exactly 2 seconds
- [ ] Graceful fallback for browsers without Clipboard API support
- [ ] Abbreviation and copy logic unit tested at more than 90% coverage
- [ ] Component is accessible (keyboard focusable, has aria-label)
- [ ] Screenshot of copy button with tooltip visible attached to PR
- [ ] README documents component props and usage examples

## PR and Checkout
```bash
git checkout -b feat/148-clipboard-copy-utility
git add .
git commit -m "feat: add reusable clipboard copy utility component"
git push origin feat/148-clipboard-copy-utility
```
Open a PR against `main` and include `Closes #138` in the PR description.
"""

issues[139] = """**Type:** FE

## Context
A dark/light theme toggle is a baseline UX expectation and improves accessibility for users in bright environments.

## Implementation Guide
1. Define all color tokens as CSS variables in :root and [data-theme='light'] selectors in globals.css
2. Replace all hardcoded Tailwind color classes with CSS variable references
3. Create a useTheme hook that reads/writes data-theme attribute on document.documentElement
4. Persist theme to localStorage key stella_theme
5. On first load, check window.matchMedia('(prefers-color-scheme: dark)') before reading localStorage
6. Add a toggle button in the navbar that calls toggleTheme() from the hook

## Guidelines
- Full dark/light theme using CSS custom properties
- All colors reference CSS variables, no hardcoded values
- Theme persists in localStorage
- Toggle in navbar
- Respect prefers-color-scheme on first load
- Key requirement: CSS Variables / Dark-Light Switch

## Definition of Done
- [ ] All colors, shadows, and backgrounds use CSS variables with zero hardcoded color values
- [ ] Dark and light themes are visually complete with no unstyled elements
- [ ] Theme preference persists in localStorage and restores on next visit
- [ ] prefers-color-scheme correctly applied on first visit
- [ ] Toggle button in navbar switches theme instantly without page reload
- [ ] Theme switching logic unit tested at more than 90% coverage
- [ ] CSS variable naming convention documented with inline comments
- [ ] Screenshot of both dark and light themes attached to PR
- [ ] README documents how to add new theme tokens

## PR and Checkout
```bash
git checkout -b feat/149-dynamic-theming-engine
git add .
git commit -m "feat: implement CSS variable-based dark/light theme engine"
git push origin feat/149-dynamic-theming-engine
```
Open a PR against `main` and include `Closes #139` in the PR description.
"""

issues[140] = """**Type:** FE

## Context
As the number of markets grows, users need a fast way to find relevant markets. A search and filter system is essential for discoverability at scale.

## Implementation Guide
1. Install fuse.js and configure with keys: ['question', 'category'], threshold: 0.4
2. Create a useMarketSearch(markets, query) hook that returns filtered results
3. Build filter controls: category tag buttons and status dropdown
4. Sort controls: volume (desc), end date (asc), newest (created_at desc)
5. Sync all filter/search state to URL query params using useRouter and URLSearchParams
6. On mount, read URL params and restore filter state
7. Debounce search input by 200ms to avoid excessive fuse.js calls

## Guidelines
- Fuzzy search with fuse.js across market titles
- Filter by category tags and status
- Sort by volume, end date, newest
- Search and filter state in URL query params
- Results update instantly as user types
- Key requirement: Fuzzy Search / Category Tags

## Definition of Done
- [ ] Fuzzy search returns relevant results for partial and misspelled queries
- [ ] All filter combinations work correctly together
- [ ] URL query params update on every filter/search change and restore state on page load
- [ ] Results update with no noticeable lag as user types
- [ ] Search, filter, and sort logic unit tested at more than 90% coverage
- [ ] fuse.js configuration and scoring logic explained with inline comments
- [ ] Screenshot of search and filter UI in use attached to PR
- [ ] README documents supported filter parameters and URL query param format

## PR and Checkout
```bash
git checkout -b feat/150-search-filter-engine
git add .
git commit -m "feat: add fuzzy search and filter engine for markets"
git push origin feat/150-search-filter-engine
```
Open a PR against `main` and include `Closes #140` in the PR description.
"""

issues[141] = """**Type:** BE

## Context
The core smart contract is the foundation of the entire platform. It must be robust, gas-efficient, and fully tested before any other features can be built on top.

## Implementation Guide
1. Define storage keys: DataKey::Market(u64), DataKey::Bets(u64), DataKey::TotalPool(u64)
2. create_market: validate end_date is in the future, outcomes length is 2-5, store Market struct
3. place_bet: require bettor auth, validate market is open and not expired, call token::Client::transfer to lock funds
4. resolve_market: require admin auth, validate winning_outcome index, set market.resolved = true
5. distribute_rewards: iterate bets, calculate each winner share as (bet_amount * total_pool * 97/100) / winning_stake
6. Write unit tests using soroban_sdk::testutils for all state transitions including invalid inputs

## Guidelines
- Soroban (Rust) binary market contract with token Wasm integration
- Handle: create, bet, resolve, distribute
- Unit tests for all state transitions
- cargo audit must pass
- Key requirement: Soroban (Rust) / Token Wasm

## Definition of Done
- [ ] Contract compiles to Wasm without warnings
- [ ] All 4 core functions implemented and working on testnet
- [ ] Token locking works correctly — funds held in contract until resolution
- [ ] Proportional payout calculation is mathematically verified with unit tests
- [ ] Unit tests cover all state transitions at more than 90% coverage including invalid inputs
- [ ] cargo audit passes with zero high or critical advisories
- [ ] All contract logic blocks have inline comments explaining state changes
- [ ] README documents contract deployment steps and function signatures

## PR and Checkout
```bash
git checkout -b feat/151-binary-market-engine
git add .
git commit -m "feat: implement Soroban binary market engine with token locking"
git push origin feat/151-binary-market-engine
```
Open a PR against `main` and include `Closes #141` in the PR description.
"""

issues[142] = """**Type:** BE

## Context
Markets need to be resolved automatically when their end date passes. Manual resolution is not scalable and introduces human error risk.

## Implementation Guide
1. Create a Node.js cron job using node-cron: cron.schedule('*/5 * * * *', checkExpiredMarkets)
2. checkExpiredMarkets: query DB for markets where end_date <= NOW() AND resolved = false
3. For each market, call the appropriate oracle resolver based on market category
4. Retry logic: wrap oracle call in a loop with exponential backoff up to 3 attempts
5. On 3 failures, insert into dead_letter_queue table with error details
6. Admin override: POST /api/admin/markets/:id/resolve with JWT auth middleware

## Guidelines
- Node.js cron polling expired unresolved markets
- Multiple oracle types supported
- Retry with exponential backoff
- Dead-letter queue for failures
- Admin override endpoint
- Key requirement: Node.js / Cron / Oracle API

## Definition of Done
- [ ] Cron job correctly identifies and processes all expired unresolved markets
- [ ] At least 2 oracle types integrated (price feed + sports API)
- [ ] Retry logic retries up to 3 times with exponential backoff before dead-lettering
- [ ] Failed resolutions stored in dead-letter queue and alertable
- [ ] Admin override endpoint is authenticated and works correctly
- [ ] Cron and oracle logic unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Retry and dead-letter logic explained with inline comments
- [ ] README documents supported oracle types and how to add new ones

## PR and Checkout
```bash
git checkout -b feat/152-automated-resolver
git add .
git commit -m "feat: add automated market resolver with cron and oracle integration"
git push origin feat/152-automated-resolver
```
Open a PR against `main` and include `Closes #142` in the PR description.
"""

issues[143] = """**Type:** BE

## Context
Anomalous betting activity such as flash loan attacks can drain market pools. A circuit breaker provides an automatic safety net.

## Implementation Guide
1. Add DataKey::CircuitBreaker(u64) and DataKey::PoolSnapshot(u64) to contract storage
2. On each place_bet, compare current pool to snapshot from 60 seconds ago
3. If movement exceeds 50%, set circuit_breaker_active = true and emit a CircuitBreakerTriggered event
4. At start of place_bet, check circuit_breaker_active and panic with CIRCUIT_BREAKER_ACTIVE if true
5. Admin functions: reopen_market(market_id) and force_resolve(market_id, outcome) — both require admin auth
6. Update pool snapshot every 60 seconds using a ledger timestamp check

## Guidelines
- Circuit breaker in Soroban using persistent storage flags
- Trigger: more than 50% pool movement within 60 seconds
- Pause new bets and emit contract event on trigger
- Admin reopen and force-resolve
- cargo audit must pass
- Key requirement: Soroban / Persistent Storage Safety

## Definition of Done
- [ ] Circuit breaker triggers correctly when more than 50% pool movement occurs within 60 seconds
- [ ] New bets rejected with clear error when circuit breaker is active
- [ ] Contract event emitted on trigger (verifiable via Mercury Indexer)
- [ ] Admin reopen and force-resolve functions work correctly and require auth
- [ ] Circuit breaker logic unit tested at more than 90% coverage including edge cases
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Storage flag usage and trigger conditions explained with inline comments
- [ ] README documents circuit breaker states and admin recovery procedure

## PR and Checkout
```bash
git checkout -b feat/153-circuit-breaker-lock
git add .
git commit -m "feat: implement circuit breaker lock in Soroban contract"
git push origin feat/153-circuit-breaker-lock
```
Open a PR against `main` and include `Closes #143` in the PR description.
"""

issues[144] = """**Type:** BE

## Context
Querying the Stellar RPC directly for every user request is slow and rate-limited. Mercury Indexer provides a fast queryable data layer for contract events.

## Implementation Guide
1. Configure Mercury Indexer to subscribe to all events from the prediction market contract address
2. Define a PostgreSQL schema: markets, bets, events, users tables
3. Write event handlers that parse Mercury events and upsert into the DB
4. Expose a GraphQL API using graphql-yoga or apollo-server with resolvers for bet history, market stats, user portfolio
5. Add indexes on market_id, wallet_address, created_at for query performance
6. Write example queries in the README

## Guidelines
- Mercury Indexer indexing all contract events
- GraphQL/SQL data store
- Fast queries for bet history, market stats, user portfolios
- Full schema documentation
- Key requirement: GraphQL / SQL Data Store

## Definition of Done
- [ ] Mercury Indexer successfully indexes all contract events on testnet
- [ ] GraphQL/SQL schema covers: bets, markets, users, events
- [ ] Bet history, market stats, and user portfolio queries return correct data
- [ ] Query response time is under 200ms for typical requests
- [ ] Schema and query logic unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Schema fully documented with inline comments and field descriptions
- [ ] README includes full schema definition and at least 5 example queries

## PR and Checkout
```bash
git checkout -b feat/154-mercury-indexer-logic
git add .
git commit -m "feat: set up Mercury Indexer with GraphQL/SQL data store"
git push origin feat/154-mercury-indexer-logic
```
Open a PR against `main` and include `Closes #144` in the PR description.
"""

issues[145] = """**Type:** BE

## Context
Oracles can be wrong. A dispute mechanism gives the community a way to challenge incorrect resolutions and protect users from bad outcomes.

## Implementation Guide
1. Add DataKey::Dispute(u64) storing { active, votes: Map<Address, i128>, deadline: u64 }
2. open_dispute(market_id): callable by any token holder within 24h of resolution
3. cast_vote(market_id, support): require voter auth, fetch STELLA token balance, add weighted vote
4. Check threshold: if support_votes / total_votes > 0.6, set market to re_review state and pause payouts
5. close_dispute(market_id): callable after deadline, finalizes outcome based on vote result
6. Pause distribute_rewards if dispute.active = true

## Guidelines
- Token holders vote within 24h post-resolution
- Weighted by STELLA token holdings
- More than 60% threshold triggers re-review
- Payouts paused during dispute
- cargo audit must pass
- Key requirement: Weighted Consensus / Voting Logic

## Definition of Done
- [ ] Dispute window correctly opens for 24 hours after market resolution
- [ ] Vote weighting by STELLA token balance is mathematically correct
- [ ] Market enters re-review state when more than 60% voting weight threshold is reached
- [ ] Payouts correctly paused during active dispute window
- [ ] Voting logic unit tested at more than 90% coverage including tie and threshold edge cases
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Weighted consensus algorithm explained with inline comments
- [ ] README documents the full dispute flow and governance parameters

## PR and Checkout
```bash
git checkout -b feat/155-dispute-voting
git add .
git commit -m "feat: implement weighted dispute voting mechanism"
git push origin feat/155-dispute-voting
```
Open a PR against `main` and include `Closes #145` in the PR description.
"""

issues[146] = """**Type:** BE

## Context
High contract execution costs make small bets economically unviable. Optimizing storage patterns directly reduces costs for all users.

## Implementation Guide
1. Run soroban contract invoke with --cost flag on each function to get baseline metrics
2. Identify all Map<Address, T> storage patterns — these are expensive due to key hashing
3. Refactor to Vec<(Address, T)> where sequential access is acceptable
4. For bet storage, use Vec<Bet> with a linear scan instead of Map<Address, Bet>
5. Re-run cost profiling after each refactor and record the delta
6. Ensure all existing unit tests still pass after refactor

## Guidelines
- Audit and refactor storage from Map to Vec where appropriate
- Profile with Soroban budget tracking tools
- Target: 30% reduction in average contract call cost
- Document before/after metrics in PR
- cargo audit must pass
- Key requirement: Storage Map to Vec Refactor

## Definition of Done
- [ ] All Map-to-Vec refactors complete and contracts pass all existing tests
- [ ] Average contract call cost reduced by at least 30% (verified with budget profiler)
- [ ] Before/after cost metrics documented in the PR for each refactored function
- [ ] No regressions in contract behavior after refactor
- [ ] Refactored code unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Storage pattern decisions explained with inline comments
- [ ] README updated with gas optimization findings and methodology

## PR and Checkout
```bash
git checkout -b perf/156-gas-optimization
git add .
git commit -m "perf: refactor Soroban storage patterns for gas optimization"
git push origin perf/156-gas-optimization
```
Open a PR against `main` and include `Closes #146` in the PR description.
"""

issues[147] = """**Type:** BE

## Context
Without a creation fee the platform is vulnerable to spam markets that pollute the discovery feed and waste oracle resources.

## Implementation Guide
1. Add DataKey::CreationFee and DataKey::FeeDestination to contract storage
2. In create_market, call token::Client::transfer(creator, fee_destination, creation_fee) before creating the market
3. If fee transfer fails, abort market creation with INSUFFICIENT_FEE_BALANCE error
4. Add update_fee(new_fee, new_destination) admin function requiring admin auth
5. Burn address on Stellar: use the issuer account with a locked trustline
6. DAO treasury: a multisig Stellar account address stored in DataKey::Treasury

## Guidelines
- Configurable market creation fee in Soroban
- Fee set by DAO governance
- Fee burned or transferred to DAO treasury
- Fee config updatable without redeployment
- cargo audit must pass
- Key requirement: XLM Burn / DAO Transfer Logic

## Definition of Done
- [ ] Market creation correctly charges the configured fee before creating the market
- [ ] Fee burn and DAO treasury transfer both work correctly based on config
- [ ] Admin can update fee amount without redeploying the contract
- [ ] Fee config update requires admin authentication
- [ ] Fee logic unit tested at more than 90% coverage including zero-fee and max-fee edge cases
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Fee collection and routing logic explained with inline comments
- [ ] README documents fee configuration parameters and DAO governance integration

## PR and Checkout
```bash
git checkout -b feat/157-market-creation-fee
git add .
git commit -m "feat: implement configurable market creation fee with burn/DAO routing"
git push origin feat/157-market-creation-fee
```
Open a PR against `main` and include `Closes #147` in the PR description.
"""

issues[148] = """**Type:** BE

## Context
Relying on a single oracle is a critical security vulnerability. A medianizer aggregates multiple sources and filters outliers, making manipulation significantly harder.

## Implementation Guide
1. Create an OracleMedianizer class that accepts an array of oracle fetcher functions
2. Call all fetchers in parallel using Promise.all
3. Sort results and compute median: for odd count take middle value, for even take average of two middle values
4. Outlier detection: compute mean and std dev, discard values where |value - mean| > 2 * stdDev
5. Re-compute median on filtered set
6. Log all source values, discarded outliers, and final median to the audit log
7. Minimum 3 sources required — throw if fewer than 3 return valid data

## Guidelines
- Pull from 3+ independent oracle sources in parallel
- Compute median across all sources
- Discard outliers more than 2 standard deviations from median
- Log all source values and computed median
- cargo audit must pass
- Key requirement: Multi-Feed Aggregator / Outlier Check

## Definition of Done
- [ ] At least 3 independent oracle sources integrated and queried in parallel
- [ ] Median computation is mathematically correct (verified with unit tests)
- [ ] Outlier detection correctly discards values more than 2 standard deviations from median
- [ ] All source values and computed median logged for every resolution
- [ ] Aggregation and outlier logic unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Median and outlier detection algorithm explained with inline comments
- [ ] README documents supported oracle sources and how to add new ones

## PR and Checkout
```bash
git checkout -b feat/158-oracle-medianizer
git add .
git commit -m "feat: implement multi-feed oracle medianizer with outlier detection"
git push origin feat/158-oracle-medianizer
```
Open a PR against `main` and include `Closes #148` in the PR description.
"""

issues[149] = """**Type:** BE

## Context
New markets often start with low liquidity making odds unreliable and discouraging participation. Automated bots can seed initial pools and maintain healthy depth.

## Implementation Guide
1. Define a BotStrategy interface: { name, shouldTrigger(event), execute(marketId) }
2. Create an event bus using Node.js EventEmitter
3. Emit market.created and pool.low events from the relevant API endpoints
4. Register bot strategies as listeners on the event bus
5. Implement a SeedLiquidityBot strategy that places small bets on both outcomes when a market is created
6. Each bot instance has a killSwitch flag — set to true to stop execution
7. Monitor bot activity and log all actions to the audit log

## Guidelines
- Event-driven hook system for new market creation and low pool depth
- Modular pluggable bot strategies
- Configurable risk parameters
- Kill-switch per bot instance
- Key requirement: Event-Driven Architecture

## Definition of Done
- [ ] Hook system triggers correctly on both new market creation and low pool depth events
- [ ] At least 2 different bot strategies implemented as pluggable modules
- [ ] Risk parameters (max stake per market, min pool threshold) are configurable
- [ ] Kill-switch correctly stops a bot instance without affecting other bots
- [ ] Hook and bot logic unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Event-driven architecture and plugin interface explained with inline comments
- [ ] README documents how to implement and register a new bot strategy

## PR and Checkout
```bash
git checkout -b feat/159-liquidity-bot-hook
git add .
git commit -m "feat: implement event-driven liquidity bot hook system"
git push origin feat/159-liquidity-bot-hook
```
Open a PR against `main` and include `Closes #149` in the PR description.
"""

issues[150] = """**Type:** BE

## Context
Total Value Locked is the primary health metric for a DeFi protocol. Real-time TVL monitoring enables rapid response to anomalies and builds user trust.

## Implementation Guide
1. Install prom-client and create a /metrics endpoint
2. Define a tvl_total_xlm gauge metric and a tvl_per_market gauge with market_id label
3. Every 30 seconds, query all active market pool balances and update the gauges
4. Alert rule in Prometheus: TVL drop more than 20% within 5 minutes
5. Connect Grafana data source to Prometheus and create a TVL over time panel
6. Add a /api/tvl endpoint that returns current TVL for the frontend dashboard

## Guidelines
- Aggregate all active market pool balances in real-time
- Prometheus endpoint for metrics
- Grafana dashboard for visualization
- Alert on TVL drop more than 20% within 5 minutes
- Key requirement: Real-time Dashboard / Prometheus

## Definition of Done
- [ ] TVL aggregation correctly sums all active market pool balances in real-time
- [ ] Prometheus endpoint exposes TVL and per-market metrics in correct format
- [ ] Grafana dashboard configured and displays TVL over time
- [ ] Alert fires correctly when TVL drops more than 20% within a 5-minute window
- [ ] Aggregation and alerting logic unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Metric names and alert thresholds documented with inline comments
- [ ] README documents how to connect Grafana and configure alert thresholds

## PR and Checkout
```bash
git checkout -b feat/160-tvl-monitoring-service
git add .
git commit -m "feat: add TVL monitoring service with Prometheus and Grafana"
git push origin feat/160-tvl-monitoring-service
```
Open a PR against `main` and include `Closes #150` in the PR description.
"""

issues[151] = """**Type:** BE

## Context
Mercury Indexer may have gaps or downtime. An independent ledger scraper provides a complete tamper-proof audit trail of all contract interactions.

## Implementation Guide
1. Write a Go service with a main loop iterating ledger sequences
2. Call Stellar Horizon GET /ledgers/:sequence/operations for each ledger
3. Filter operations by contract address and parse relevant events
4. Use a goroutine pool with sync.WaitGroup and buffered channel to process 10 ledgers concurrently
5. Store archived events in PostgreSQL with columns: ledger_seq, tx_hash, event_type, data, timestamp
6. Catch-up mode: accept a --start-ledger CLI flag to process historical ledgers
7. Track last processed ledger in DB to resume after restart

## Guidelines
- Go service scraping Stellar ledger events ledger-by-ledger
- Archive all contract interactions to persistent store
- Goroutines for parallel processing
- Catch-up mode for historical ledgers
- Key requirement: Go / Ledger-by-Ledger Archiving

## Definition of Done
- [ ] Go service correctly scrapes and archives all contract events from testnet
- [ ] Goroutine-based parallel processing handles at least 10 ledgers concurrently
- [ ] Catch-up mode correctly processes historical ledgers from a given start point
- [ ] No ledger events missed or duplicated in the archive
- [ ] Scraper logic unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Goroutine management and catch-up logic explained with inline comments
- [ ] README documents how to run the scraper, configure start ledger, and query the archive

## PR and Checkout
```bash
git checkout -b feat/161-ledger-event-scraper
git add .
git commit -m "feat: implement Go ledger event scraper with goroutine parallelism"
git push origin feat/161-ledger-event-scraper
```
Open a PR against `main` and include `Closes #151` in the PR description.
"""

issues[152] = """**Type:** BE

## Context
Unclaimed payouts from resolved markets sit idle in the contract. Putting these funds to work via yield strategies benefits the protocol and token holders.

## Implementation Guide
1. Add DataKey::VaultBalance and DataKey::ClaimDeadline(u64) to contract storage
2. Create a sweep_unclaimed(market_id) function callable after 30 days post-resolution
3. Check each bet in the market — if paid_out = false and deadline passed, add to vault balance
4. invest_vault(): call Stellar AMM swap or deposit operation with vault balance
5. claim_original(market_id) remains callable at any time — pays from vault balance if already swept
6. Track original payout amounts separately from yield so claimants always get their exact original amount

## Guidelines
- Sweep unclaimed funds from markets resolved more than 30 days ago
- Re-invest via Stellar AMM pools
- Original claimants can still withdraw at any time
- cargo audit must pass
- Key requirement: Soroban / Automated Yield Re-invest

## Definition of Done
- [ ] Sweep correctly identifies and moves unclaimed funds from markets resolved more than 30 days ago
- [ ] AMM re-investment executes correctly on testnet
- [ ] Original claimants can withdraw their full original payout at any time after sweep
- [ ] Sweep does not affect markets resolved less than 30 days ago
- [ ] Vault and sweep logic unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Sweep conditions and AMM interaction explained with inline comments
- [ ] README documents the vault mechanics and claimant withdrawal process

## PR and Checkout
```bash
git checkout -b feat/162-vault-rebalancing
git add .
git commit -m "feat: implement vault re-balancing with automated yield re-investment"
git push origin feat/162-vault-rebalancing
```
Open a PR against `main` and include `Closes #152` in the PR description.
"""

issues[153] = """**Type:** BE

## Context
Admin and oracle actions must be auditable. Immutable logs stored on IPFS with on-chain hashes provide tamper-proof accountability.

## Implementation Guide
1. Create an AuditLogger service that accepts { actor, action, details, timestamp }
2. Serialize the log entry to JSON and upload to IPFS via Pinata
3. Record the returned IPFS CID on-chain using a DataKey::AuditLog(u64) storage entry
4. Verification: anyone can fetch the CID from on-chain, retrieve from IPFS, and confirm the hash matches
5. Build a GET /api/audit-logs endpoint that returns all log entries with their CIDs
6. Build a simple audit log viewer component in the UI that fetches and displays logs

## Guidelines
- Log all admin and oracle actions with timestamp, actor, and details
- Store on IPFS, record content hash on-chain
- Public audit log viewer in UI
- cargo audit must pass
- Key requirement: Immutable Tx History / IPFS Logs

## Definition of Done
- [ ] All admin and oracle actions logged with correct timestamp, actor address, and details
- [ ] Logs stored on IPFS and content hash recorded on-chain correctly
- [ ] On-chain hash can be used to verify log integrity against IPFS content
- [ ] Public audit log viewer displays logs correctly in the UI
- [ ] Logging and verification logic unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] IPFS storage and hash verification flow explained with inline comments
- [ ] README documents the log format, verification process, and viewer usage

## PR and Checkout
```bash
git checkout -b feat/163-audit-logging
git add .
git commit -m "feat: implement immutable audit logging with IPFS and on-chain hashes"
git push origin feat/163-audit-logging
```
Open a PR against `main` and include `Closes #153` in the PR description.
"""

issues[154] = """**Type:** BE

## Context
Requiring admin approval for every market does not scale. Permissionless market creation with automated validation enables community-driven growth.

## Implementation Guide
1. Create a validateMarket(metadata) function with 4 checks: no duplicate, valid end date, description length, outcome count
2. Return specific error codes for each failure: DUPLICATE_MARKET, INVALID_END_DATE, DESCRIPTION_TOO_SHORT, INVALID_OUTCOME_COUNT
3. Rate limit: use Redis INCR with TTL of 86400s on key rate_limit:create:{walletAddress}
4. If count exceeds 3, return RATE_LIMIT_EXCEEDED with retry-after header
5. Valid markets are published immediately without admin intervention

## Guidelines
- Automated metadata verification on market submission
- Validation: no duplicates, valid end date, min 50 char description, 2-5 outcomes
- Specific error responses per validation failure
- Rate limit: max 3 creations per wallet per 24 hours
- Key requirement: Automated Metadata Verification

## Definition of Done
- [ ] All 4 validation rules enforced correctly
- [ ] Each validation failure returns a specific actionable error message
- [ ] Rate limit correctly blocks a 4th market creation within 24 hours from the same wallet
- [ ] Valid markets published without admin intervention
- [ ] Validation and rate limit logic unit tested at more than 90% coverage
- [ ] cargo audit passes with zero high or critical advisories
- [ ] Each validation rule explained with inline comments
- [ ] README documents all validation rules and error response formats

## PR and Checkout
```bash
git checkout -b feat/164-permissionless-launch
git add .
git commit -m "feat: implement permissionless market creation with automated validation"
git push origin feat/164-permissionless-launch
```
Open a PR against `main` and include `Closes #154` in the PR description.
"""

issues[155] = """**Type:** BE

## Context
The platform must handle peak traffic without degradation. A comprehensive stress test suite identifies bottlenecks before they affect real users.

## Implementation Guide
1. Install Taurus: pip install bzt
2. Create stress-test.yml config with 3 scenarios: concurrent bets, market resolution under load, WebSocket connections
3. Concurrent bets scenario: 500 users, each placing 1 bet, ramp up over 60 seconds
4. Resolution scenario: trigger 50 market resolutions simultaneously and measure response time
5. WebSocket scenario: open 1000 concurrent WebSocket connections and measure connection success rate
6. Run: bzt stress-test.yml and capture the HTML report
7. Add a CI step that fails if p95 latency exceeds 2s or error rate exceeds 1%

## Guidelines
- Taurus with Go-routine based concurrent users
- Test targets: 500 concurrent bets, resolution under load, WebSocket limits
- Document throughput, p95 latency, error rate
- Identify bottlenecks with recommended fixes
- Include in CI
- Key requirement: Taurus / Go-routine Load Testing

## Definition of Done
- [ ] 500 concurrent bets test completes with error rate below 1%
- [ ] Market resolution under load completes within 5s p95
- [ ] WebSocket connection limit identified and documented
- [ ] Full results report included in PR: throughput, p95 latency, error rate, bottlenecks
- [ ] Recommended fixes for each identified bottleneck documented
- [ ] Test suite integrated into CI and runs on every PR to main
- [ ] Test scenarios and thresholds explained with inline comments
- [ ] cargo audit passes with zero high or critical advisories
- [ ] README documents how to run stress tests locally and interpret results

## PR and Checkout
```bash
git checkout -b feat/165-throughput-stress-test
git add .
git commit -m "test: add Taurus throughput stress test suite with CI integration"
git push origin feat/165-throughput-stress-test
```
Open a PR against `main` and include `Closes #155` in the PR description.
"""

for num, body in issues.items():
    with open(f"{d}/{num}.md", "w", encoding="utf-8") as f:
        f.write(body.strip())
    print(f"Written {num}.md")

print("All body files written.")
