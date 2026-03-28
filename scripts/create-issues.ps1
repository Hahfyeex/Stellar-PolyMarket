param([string]$Token)

$headers = @{
    Authorization = "token $Token"
    "User-Agent"  = "kiro-issue-creator"
    Accept        = "application/vnd.github.v3+json"
}
$repo = "Hahfyeex/Stellar-PolyMarket"

function Post-Issue($title, $body, $labels) {
    $payload = @{ title = $title; body = $body; labels = $labels } | ConvertTo-Json -Depth 4
    try {
        $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/issues" `
            -Method POST -Headers $headers -Body $payload -ContentType "application/json"
        Write-Host "OK #$($r.number): $title"
    } catch {
        Write-Host "FAIL: $title | $_"
    }
    Start-Sleep -Seconds 2
}

$dod = @"

---
## Definition of Done
- **Code Quality:** Unit tests >90% coverage required
- **Documentation:** README updated + inline comments on every logic block
- **UI Consistency:** Adhere to Stella Polymarket color palette and 4px spacing grid
- **Security:** Backend/contract issues must pass ``cargo audit`` before merge
"@

# ── UI/UX ──────────────────────────────────────────────────────────────────

Post-Issue "[UIUX] #126 - Adaptive Betting Slip" @"
**Type:** UIUX

## Context
Users can only place one bet at a time, requiring multiple wallet approvals. This creates friction especially on mobile where UX should feel native and fluid.

## Guidelines
- Build a slide-up drawer that animates from the bottom on mobile and renders as a fixed side panel on desktop
- Allow users to queue up to 5 bets before submitting
- Bundle all queued bets into a single Freighter transaction
- Drawer open/close state managed globally via Redux or Context
- Include a bet summary line per queued item with a remove option
- Key requirement: Slide-up Drawer / Batching Logic
$dod
"@ @("UI/UX","enhancement")

Post-Issue "[UIUX] #127 - Liquidity Heatmap" @"
**Type:** UIUX

## Context
Traders need to quickly assess where liquidity is concentrated. A visual heatmap overlay gives instant depth perception without reading raw numbers.

## Guidelines
- Use layered CSS div overlays with opacity values tied to pool size from the API
- Deeper liquidity zones appear more saturated (higher opacity)
- Color scale: blue for YES-side depth, orange for NO-side depth
- Overlay updates when pool data refreshes
- Render as a background layer behind order book rows
- Key requirement: CSS Depth Overlays / Transparency
$dod
"@ @("UI/UX","enhancement")

Post-Issue "[UIUX] #128 - Reputation Badges" @"
**Type:** UIUX

## Context
Gamification drives engagement. Users who consistently make accurate predictions should be visually recognized. Badges create a status system that encourages long-term participation.

## Guidelines
- Design 4 SVG badge tiers: Bronze, Silver, Gold, Diamond
- Award logic based on prediction accuracy and total markets participated
- Each badge has a distinct glow effect on hover using CSS box-shadow
- Badges appear on user profile and next to wallet address in leaderboard
- Thresholds: Bronze >10 markets, Silver >50+55%, Gold >100+65%, Diamond >200+75%
- Key requirement: SVG Assets / Glow Micro-interactions
$dod
"@ @("UI/UX","enhancement")

Post-Issue "[UIUX] #129 - Social Proof Ticker" @"
**Type:** UIUX

## Context
Seeing other users actively betting builds trust and FOMO, two key drivers of prediction market engagement. A live ticker makes the platform feel alive.

## Guidelines
- Scrolling ticker showing recent bets: 'User G***3 staked 50 XLM on YES'
- Use Framer Motion for smooth entry/exit slide animations
- Feed data via WebSocket or 10-second polling from the backend
- Anonymize wallet addresses (first 4 + last 3 chars)
- Ticker pauses on hover to let users read entries
- Key requirement: Framer Motion / Real-time Feed
$dod
"@ @("UI/UX","enhancement")

Post-Issue "[UIUX] #130 - Onboarding Wizard" @"
**Type:** UIUX

## Context
New users unfamiliar with prediction markets or Stellar wallets need guided onboarding. Without it, drop-off rates at the wallet connection step are high.

## Guidelines
- 4-step wizard: (1) Connect Wallet (2) How Markets Work (3) Place First Bet (4) Understanding Payouts
- Progress stepper visible at top of each step
- Include a Skip option that jumps to the dashboard
- Persist completion state in localStorage
- Each step has a short illustration or icon
- Key requirement: 4-step Progress Stepper / Logic
$dod
"@ @("UI/UX","enhancement","good first issue")

Post-Issue "[UIUX] #131 - What-If Simulator" @"
**Type:** UIUX

## Context
Users want to understand potential returns before committing funds. A simulator removes uncertainty and encourages larger, more confident stakes.

## Guidelines
- Collapsible simulator panel on the market detail page
- Input: stake amount via slider or text field
- Output: projected payout if correct, loss if wrong, based on current pool odds
- Render results as a bar or line chart using Recharts
- Update projections in real-time as user adjusts input
- Show current implied probability alongside projected return
- Key requirement: P&L Projections / Portfolio Charts
$dod
"@ @("UI/UX","enhancement")

Post-Issue "[UIUX] #132 - High-Volatility Pulse" @"
**Type:** UIUX

## Context
In fast-moving markets, users need an immediate visual signal when odds are shifting rapidly. A pulse animation draws attention without requiring constant number-watching.

## Guidelines
- Trigger pulse animation on market cards when odds change >5% within 60 seconds
- Use CSS @keyframes for a border or background glow pulse
- Green pulse for rising YES odds, red for falling YES odds
- Trigger threshold should be a configurable constant
- Animation runs 3 cycles then stops, not infinite loop
- Key requirement: CSS @keyframes / Color Logic
$dod
"@ @("UI/UX","enhancement")

Post-Issue "[UIUX] #133 - Share Pizza Chart" @"
**Type:** UIUX

## Context
In markets with few large stakers, users want to see how the pool is distributed. A fractional ownership chart adds transparency and social context.

## Guidelines
- Pie chart using Recharts on the market detail page
- Each slice represents one bettor's share of the total pool
- Tooltip on hover shows abbreviated wallet address and exact stake amount
- Chart updates live as new bets come in
- Group wallets with less than 1% share into an Others slice
- Key requirement: Recharts / Fractional Ownership
$dod
"@ @("UI/UX","enhancement")

Post-Issue "[UIUX] #134 - Market Discovery Cards" @"
**Type:** UIUX

## Context
Users need a way to discover new markets relevant to their interests. Generic lists don't drive engagement, personalized visually rich cards do.

## Guidelines
- SVG category illustrations: Sports, Crypto, Finance, Politics, Weather
- Suggestion logic based on user's past category activity or trending volume
- Subtle hover lift effect (CSS transform + box-shadow)
- Include market end date, current pool size, and category tag on each card
- Trending markets show a Hot badge
- Key requirement: SVG Illustrations / Suggestion Logic
$dod
"@ @("UI/UX","enhancement")

Post-Issue "[UIUX] #135 - Priority Notification Inbox" @"
**Type:** UIUX

## Context
Users miss critical events like market resolution and payouts because there is no in-app alert system. A notification inbox keeps users informed and drives them back to claim winnings.

## Guidelines
- Notification dropdown accessible from the navbar
- Types: Market Resolved, Payout Available, Market Ending in 1 Hour
- Render at z-index 1100 to sit above all modals and overlays
- Read/unread state with a blue dot indicator
- Clear All button
- Persist notification state in localStorage or backend
- Key requirement: Inbox Logic / Z-index 1100
$dod
"@ @("UI/UX","enhancement")

Write-Host "=== UIUX done (126-135) ==="

# ── FRONTEND ───────────────────────────────────────────────────────────────

Post-Issue "[FE] #136 - Transaction Batching" @"
**Type:** FE

## Context
Every separate contract call requires a Freighter wallet pop-up. Batching multiple calls into one reduces approvals and dramatically improves UX.

## Guidelines
- Use Freighter SDK atomic transaction bundling API
- Batch common flows: bet + trustline, bet + fee approval
- On failure, roll back cleanly with specific error messages per failed operation
- Expose a useBatchTransaction hook for reuse across components
- Test on Stellar testnet before mainnet
- Key requirement: Freighter SDK / Atomic Bundling
$dod
"@ @("frontend","enhancement")

Post-Issue "[FE] #137 - Live Odds Sync" @"
**Type:** FE

## Context
Static odds that only update on page refresh make the platform feel outdated. Real-time odds are a core expectation for any prediction market.

## Guidelines
- Connect to Mercury Indexer via WebSocket for live contract event streaming
- Update odds on market cards and detail pages without full re-render
- Subtle yellow flash animation when a value changes
- Exponential backoff reconnect logic for dropped connections
- Debounce rapid updates (max 1 update per 500ms)
- Key requirement: Mercury Indexer / WebSockets
$dod
"@ @("frontend","enhancement")

Post-Issue "[FE] #138 - Client-Side Slippage" @"
**Type:** FE

## Context
XLM uses 7 decimal precision and market odds can shift between bet submission and confirmation. Without slippage protection users can receive significantly worse payouts.

## Guidelines
- Use BigInt math throughout to avoid floating point precision errors
- Slippage tolerance options: 0.5%, 1%, 2%, or custom
- Persist user preferred slippage in localStorage
- Compare current odds to odds at time of input before confirming
- Warning modal if drift exceeds tolerance with option to proceed or cancel
- Key requirement: BigInt Math / User Presets
$dod
"@ @("frontend","enhancement")

Post-Issue "[FE] #139 - IPFS Resolver" @"
**Type:** FE

## Context
Storing full market metadata on-chain is expensive. IPFS allows rich descriptions and source links off-chain while keeping a content hash on-chain for verification.

## Guidelines
- Build a useIPFSMetadata(cid) hook using Pinata SDK
- Fetch JSON metadata: description, category, source URLs, creator notes
- Cache resolved metadata using React Query or SWR
- Fall back to on-chain data if IPFS is unavailable (5s timeout)
- Display a Metadata unavailable state gracefully
- Key requirement: Pinata SDK / JSON Metadata Hook
$dod
"@ @("frontend","enhancement")

Post-Issue "[FE] #140 - Form Persistence" @"
**Type:** FE

## Context
Users frequently lose bet form inputs when accidentally navigating away or refreshing. This leads to abandoned bets and frustration.

## Guidelines
- Persist: selected outcome index, stake amount, slippage setting
- Use localStorage with a per-market key for independent state per market
- Restore state on component mount
- Clear persisted state on successful bet submission
- Add a Clear form button for manual reset
- Key requirement: LocalStorage / State Sync
$dod
"@ @("frontend","enhancement","good first issue")

Post-Issue "[FE] #141 - Virtualized Order Book" @"
**Type:** FE

## Context
Markets with hundreds of bets render thousands of DOM nodes causing severe performance degradation on low-end devices common in target markets.

## Guidelines
- Use react-window with FixedSizeList for order book rows
- Each row: wallet address (abbreviated), outcome, amount, timestamp
- Dynamic data updates without full list re-render
- Test with 500+ rows to confirm smooth scrolling
- Add infinite scroll trigger at the bottom
- Key requirement: react-window / Performance
$dod
"@ @("frontend","performance")

Post-Issue "[FE] #142 - Trustline Auto-Checker" @"
**Type:** FE

## Context
Users trying to bet with custom Stellar assets fail silently if they don't have the required trustline. This is a common confusion point for non-technical users.

## Guidelines
- Query Horizon API before bet submission to check for required trustline
- If missing, show clear explanation: Your wallet needs to trust [ASSET] before betting
- Auto-construct the trustline transaction for one-click Freighter approval
- Resume bet flow automatically after trustline is set
- Handle edge cases: wallet not connected, Horizon API timeout
- Key requirement: Horizon API / Automatic Tx
$dod
"@ @("frontend","enhancement")

Post-Issue "[FE] #143 - Bundle Size Audit" @"
**Type:** FE

## Context
A large JavaScript bundle means slow initial load times, especially on 3G mobile networks common in African markets. Every KB matters.

## Guidelines
- Run Webpack Bundle Analyzer and document current bundle size
- Implement route-based code splitting with next/dynamic
- Tree-shake unused exports from Recharts, stellar-sdk
- Split vendor chunks from application code
- Target: initial JS bundle below 200KB gzipped
- Document all changes and size impact in the PR
- Key requirement: Webpack / Tree-shaking / Code-split
$dod
"@ @("frontend","performance")

Post-Issue "[FE] #144 - Contract Error Boundary" @"
**Type:** FE

## Context
Soroban contract calls can fail for many reasons. Without proper error handling users see cryptic errors or blank screens.

## Guidelines
- Wrap all contract interaction components in React.ErrorBoundary
- Connect error state to Redux for global error tracking
- Map common contract error codes to user-friendly messages
- Log errors to a monitoring service like Sentry
- Show a retry button where appropriate
- Key requirement: React.ErrorBoundary / Redux
$dod
"@ @("frontend","bug","enhancement")

Post-Issue "[FE] #145 - i18n Translation" @"
**Type:** FE

## Context
Stella Polymarket targets global and African markets. Supporting local languages dramatically increases accessibility and trust for non-English speakers.

## Guidelines
- Integrate i18next with dynamic JSON loading
- Priority languages: English, French, Yoruba, Hausa, Swahili
- All UI strings extracted to translation JSON files
- Language selection persists in localStorage
- Respect browser locale on first visit
- Key requirement: i18next / Dynamic JSON Loading
$dod
"@ @("frontend","enhancement")

Post-Issue "[FE] #146 - Mobile Pull-to-Refresh" @"
**Type:** FE

## Context
Mobile users expect native pull-to-refresh behavior on list views. Without it the only way to get fresh market data is a full page reload.

## Guidelines
- Implement pull-to-refresh gesture on the markets list
- Use touch event listeners or react-pull-to-refresh
- Re-fetch markets list from API on trigger with loading spinner
- Must not conflict with normal vertical scroll behavior
- Minimum pull distance: 60px before triggering
- Key requirement: Swipe Gestures / List Re-fetch
$dod
"@ @("frontend","enhancement")

Post-Issue "[FE] #147 - Skeleton Loading States" @"
**Type:** FE

## Context
Loading spinners cause layout shift and feel jarring. Skeleton screens that match the layout of loading content improve perceived performance significantly.

## Guidelines
- Replace all loading spinners with CSS shimmer skeleton screens
- Skeletons must match exact layout of: market cards, order book rows, user portfolio
- Consistent shimmer animation timing across all skeletons
- No Cumulative Layout Shift (CLS) when content loads in
- Key requirement: CSS Shimmers / Layout Stability
$dod
"@ @("frontend","enhancement","good first issue")

Post-Issue "[FE] #148 - Clipboard Copy Utility" @"
**Type:** FE

## Context
Wallet addresses and transaction IDs are long and unwieldy. Users need a quick way to copy them without selecting text manually.

## Guidelines
- Build a reusable CopyButton component
- Display abbreviated format: first 6 + last 4 chars
- Copy full value to clipboard using the Clipboard API on click
- Show a brief Copied! tooltip that fades after 2 seconds
- Handle browsers that don't support Clipboard API gracefully
- Key requirement: Address/TxID Abbreviation + Copy
$dod
"@ @("frontend","enhancement","good first issue")

Post-Issue "[FE] #149 - Dynamic Theming Engine" @"
**Type:** FE

## Context
A dark/light theme toggle is a baseline UX expectation and improves accessibility for users in bright environments.

## Guidelines
- Full dark/light theme using CSS custom properties (variables)
- All colors, shadows, backgrounds reference CSS variables, no hardcoded values
- Theme preference persists in localStorage
- Toggle button in the navbar
- Respect prefers-color-scheme on first load
- Key requirement: CSS Variables / Dark-Light Switch
$dod
"@ @("frontend","enhancement")

Post-Issue "[FE] #150 - Search Filter Engine" @"
**Type:** FE

## Context
As the number of markets grows, users need a fast way to find relevant markets. A search and filter system is essential for discoverability at scale.

## Guidelines
- Fuzzy search across market titles using fuse.js
- Filter by: category tags (Sports, Crypto, Finance, Politics), status (Live, Resolved, Ending Soon)
- Sort by: volume, end date, newest
- Search and filter state reflected in URL query params
- Results update instantly as user types
- Key requirement: Fuzzy Search / Category Tags
$dod
"@ @("frontend","enhancement")

Write-Host "=== FE done (136-150) ==="

# ── BACKEND ────────────────────────────────────────────────────────────────

Post-Issue "[BE] #151 - Binary Market Engine" @"
**Type:** BE

## Context
The core smart contract is the foundation of the entire platform. It must be robust, gas-efficient, and fully tested before any other features can be built on top.

## Guidelines
- Implement binary (Yes/No) market contract in Soroban (Rust) with full token Wasm integration
- Handle: market creation, bet placement with token locking, resolution, proportional payout
- Unit tests for all state transitions
- Run cargo audit and resolve all advisories before PR
- Key requirement: Soroban (Rust) / Token Wasm
$dod
"@ @("backend","smart-contract","enhancement")

Post-Issue "[BE] #152 - Automated Resolver" @"
**Type:** BE

## Context
Markets need to be resolved automatically when their end date passes. Manual resolution is not scalable and introduces human error risk.

## Guidelines
- Node.js cron job polling active markets past their end date
- Trigger resolution via oracle API calls per market type
- Support multiple oracle types: price feeds, sports APIs, custom
- Retry logic with exponential backoff
- Dead-letter queue for failed resolutions
- Admin override endpoint for manual resolution
- Key requirement: Node.js / Cron / Oracle API
$dod
"@ @("backend","enhancement")

Post-Issue "[BE] #153 - Circuit Breaker Lock" @"
**Type:** BE

## Context
Anomalous betting activity such as flash loan attacks can drain market pools. A circuit breaker provides an automatic safety net.

## Guidelines
- Circuit breaker pattern in Soroban using persistent storage flags
- Trigger: >50% pool movement within 60 seconds
- When triggered: pause new bets, emit a contract event
- Admin can review and manually re-open or force-resolve
- Must pass cargo audit security check
- Key requirement: Soroban / Persistent Storage Safety
$dod
"@ @("backend","smart-contract","security")

Post-Issue "[BE] #154 - Mercury Indexer Logic" @"
**Type:** BE

## Context
Querying the Stellar RPC directly for every user request is slow and rate-limited. Mercury Indexer provides a fast queryable data layer for contract events.

## Guidelines
- Set up Mercury Indexer to index all Stella Polymarket contract events
- Store indexed data in a GraphQL/SQL data store
- Enable fast queries for: bet history, market stats, user portfolios
- Document the full schema and provide example queries
- Key requirement: GraphQL / SQL Data Store
$dod
"@ @("backend","enhancement")

Post-Issue "[BE] #155 - Dispute Voting" @"
**Type:** BE

## Context
Oracles can be wrong. A dispute mechanism gives the community a way to challenge incorrect resolutions and protect users from bad outcomes.

## Guidelines
- Token holders can vote to challenge a market outcome within 24 hours post-resolution
- Weighted consensus: votes weighted by STELLA token holdings
- If dispute passes threshold (>60% voting weight), market enters re-review state
- Payouts paused during dispute window
- Must pass cargo audit security check
- Key requirement: Weighted Consensus / Voting Logic
$dod
"@ @("backend","smart-contract","enhancement")

Post-Issue "[BE] #156 - Gas Optimization" @"
**Type:** BE

## Context
High contract execution costs make small bets economically unviable. Optimizing storage patterns directly reduces costs for all users.

## Guidelines
- Audit all Soroban contracts and refactor storage from Map to Vec where appropriate
- Profile execution costs using Soroban budget tracking tools
- Target: reduce average contract call cost by 30%
- Document all changes with before/after cost metrics in the PR
- Must pass cargo audit security check
- Key requirement: Storage Map to Vec Refactor
$dod
"@ @("backend","smart-contract","performance")

Post-Issue "[BE] #157 - Market Creation Fee" @"
**Type:** BE

## Context
Without a creation fee the platform is vulnerable to spam markets that pollute the discovery feed and waste oracle resources.

## Guidelines
- Configurable market creation fee in the Soroban contract
- Fee amount set by DAO governance vote
- Fee is either burned or transferred to the DAO treasury address
- Fee config updatable by admin without redeploying the contract
- Must pass cargo audit security check
- Key requirement: XLM Burn / DAO Transfer Logic
$dod
"@ @("backend","smart-contract","enhancement")

Post-Issue "[BE] #158 - Oracle Medianizer" @"
**Type:** BE

## Context
Relying on a single oracle is a critical security vulnerability. A medianizer aggregates multiple sources and filters outliers, making manipulation significantly harder.

## Guidelines
- Pull price/outcome data from 3+ independent oracle sources
- Compute the median value across all sources
- Outlier detection: discard values >2 standard deviations from the median
- Log all source values and computed median for auditability
- Must pass cargo audit security check
- Key requirement: Multi-Feed Aggregator / Outlier Check
$dod
"@ @("backend","enhancement","security")

Post-Issue "[BE] #159 - Liquidity Bot Hook" @"
**Type:** BE

## Context
New markets often start with low liquidity making odds unreliable and discouraging participation. Automated bots can seed initial pools and maintain healthy depth.

## Guidelines
- Event-driven hook system triggered on: new market creation, pool depth below threshold
- Modular architecture so different bot strategies are pluggable without changing core contract
- Bots operate within configurable risk parameters
- Include monitoring and kill-switch for each bot instance
- Key requirement: Event-Driven Architecture
$dod
"@ @("backend","enhancement")

Post-Issue "[BE] #160 - TVL Monitoring Service" @"
**Type:** BE

## Context
Total Value Locked is the primary health metric for a DeFi protocol. Real-time TVL monitoring enables rapid response to anomalies and builds user trust.

## Guidelines
- Aggregate all active market pool balances in real-time
- Expose metrics via a Prometheus endpoint
- Connect to a Grafana dashboard for visualization
- Alert on sudden TVL drops >20% within a 5-minute window
- Key requirement: Real-time Dashboard / Prometheus
$dod
"@ @("backend","enhancement")

Post-Issue "[BE] #161 - Ledger Event Scraper" @"
**Type:** BE

## Context
Mercury Indexer may have gaps or downtime. An independent ledger scraper provides a complete tamper-proof audit trail of all contract interactions.

## Guidelines
- Go service that scrapes Stellar ledger events ledger-by-ledger
- Archive all Stella Polymarket contract interactions to a persistent store
- Use goroutines for parallel ledger processing
- Include a catch-up mode for processing historical ledgers
- Key requirement: Go / Ledger-by-Ledger Archiving
$dod
"@ @("backend","enhancement")

Post-Issue "[BE] #162 - Vault Re-balancing" @"
**Type:** BE

## Context
Unclaimed payouts from resolved markets sit idle in the contract. Putting these funds to work via yield strategies benefits the protocol and token holders.

## Guidelines
- Sweep unclaimed funds from markets resolved >30 days ago into a yield vault
- Re-invest via Stellar AMM pools automatically
- Original claimants can still withdraw their payout at any time
- Must pass cargo audit security check
- Key requirement: Soroban / Automated Yield Re-invest
$dod
"@ @("backend","smart-contract","enhancement")

Post-Issue "[BE] #163 - Audit Logging" @"
**Type:** BE

## Context
Admin and oracle actions must be auditable. Immutable logs stored on IPFS with on-chain hashes provide tamper-proof accountability.

## Guidelines
- Log all admin and oracle actions with timestamp, actor, and action details
- Store logs on IPFS, record content hash on-chain for verification
- Expose a public audit log viewer in the UI
- Must pass cargo audit security check
- Key requirement: Immutable Tx History / IPFS Logs
$dod
"@ @("backend","security","enhancement")

Post-Issue "[BE] #164 - Permissionless Launch" @"
**Type:** BE

## Context
Requiring admin approval for every market does not scale. Permissionless market creation with automated validation enables community-driven growth.

## Guidelines
- Automated metadata verification on market submission
- Validation rules: no duplicates, valid end date (>1 hour from now), minimum description 50 chars, valid outcome count (2-5)
- Spam/invalid markets rejected with clear specific error response
- Rate limit: max 3 market creations per wallet per 24 hours
- Key requirement: Automated Metadata Verification
$dod
"@ @("backend","enhancement")

Post-Issue "[BE] #165 - Throughput Stress Test" @"
**Type:** BE

## Context
The platform must handle peak traffic without degradation. A comprehensive stress test suite identifies bottlenecks before they affect real users.

## Guidelines
- Load tests using Taurus with Go-routine based concurrent users
- Test targets: 500 concurrent bets, market resolution under load, WebSocket connection limits
- Document results: throughput (req/s), p95 latency, error rate
- Identify all bottlenecks and provide recommended fixes
- Include test suite in CI so regressions are caught automatically
- Key requirement: Taurus / Go-routine Load Testing
$dod
"@ @("backend","testing","performance")

Write-Host "=== BE done (151-165) ==="
Write-Host "ALL 40 ISSUES CREATED"
