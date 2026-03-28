const https = require("https");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = "Hahfyeex";
const REPO = "Stellar-PolyMarket";

if (!GITHUB_TOKEN) {
  console.error("Set GITHUB_TOKEN environment variable first.");
  process.exit(1);
}

function createIssue(title, body, labels) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ title, body, labels });
    const options = {
      hostname: "api.github.com",
      path: `/repos/${OWNER}/${REPO}/issues`,
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "stella-issue-creator",
        Accept: "application/vnd.github.v3+json",
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        const json = JSON.parse(body);
        if (json.number) {
          console.log(`Created #${json.number}: ${title}`);
          resolve(json);
        } else {
          console.error(`Failed: ${title}`, json.message);
          reject(json);
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const DOD = `
## ✅ Definition of Done
- **Code Quality:** Unit tests with >90% coverage required
- **Documentation:** README.md updated + inline comments on every logic block
- **UI Consistency:** Must adhere to Stella Polymarket color palette and 4px spacing grid
- **Security:** Backend/contract issues must pass \`cargo audit\` security check
`;

const issues = [
  // ── UI/UX ──────────────────────────────────────────────────────────────────
  {
    title: "[UIUX] #126 — Adaptive Betting Slip",
    labels: ["UI/UX", "enhancement"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nCurrently users can only place one bet at a time, requiring multiple wallet approvals. This creates friction especially on mobile where the UX should feel native and fluid.\n\n## 📋 Guidelines\n- Build a slide-up drawer component that animates from the bottom on mobile and renders as a fixed side panel on desktop\n- Allow users to queue up to 5 bets before submitting\n- Batching logic should bundle all queued bets into a single Freighter transaction\n- Drawer open/close state should be managed globally (Redux or Context)\n- Include a bet summary line per queued item with a remove option\n- Key requirement: Slide-up Drawer / Batching Logic\n${DOD}`,
  },
  {
    title: "[UIUX] #127 — Liquidity Heatmap",
    labels: ["UI/UX", "enhancement"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nTraders need to quickly assess where liquidity is concentrated in a market. A visual heatmap overlay on the order book gives instant depth perception without reading raw numbers.\n\n## 📋 Guidelines\n- Use layered CSS div overlays with opacity values tied to pool size from the API\n- Deeper liquidity zones should appear more saturated (higher opacity)\n- Color scale: blue for YES-side depth, orange for NO-side depth\n- Overlay should update when pool data refreshes\n- Keep it non-blocking — render as a background layer behind order book rows\n- Key requirement: CSS Depth Overlays / Transparency\n${DOD}`,
  },
  {
    title: "[UIUX] #128 — Reputation Badges",
    labels: ["UI/UX", "enhancement"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nGamification drives engagement. Users who consistently make accurate predictions should be visually recognized. Badges create a status system that encourages long-term participation.\n\n## 📋 Guidelines\n- Design 4 SVG badge tiers: Bronze, Silver, Gold, Diamond\n- Award logic based on prediction accuracy and total markets participated\n- Each badge should have a distinct glow effect on hover using CSS box-shadow\n- Badges appear on user profile and next to wallet address in leaderboard\n- Thresholds: Bronze >10 markets, Silver >50 + 55% accuracy, Gold >100 + 65%, Diamond >200 + 75%\n- Key requirement: SVG Assets / Glow Micro-interactions\n${DOD}`,
  },
  {
    title: "[UIUX] #129 — Social Proof Ticker",
    labels: ["UI/UX", "enhancement"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nSeeing other users actively betting builds trust and FOMO — two key drivers of prediction market engagement. A live activity ticker makes the platform feel alive.\n\n## 📋 Guidelines\n- Display a scrolling ticker showing recent bets: "User G***3 staked 50 XLM on YES"\n- Use Framer Motion for smooth entry/exit slide animations\n- Feed data via WebSocket or 10-second polling from the backend\n- Anonymize wallet addresses (show first 4 + last 3 chars)\n- Ticker should pause on hover to let users read entries\n- Key requirement: Framer Motion / Real-time Feed\n${DOD}`,
  },
  {
    title: "[UIUX] #130 — Onboarding Wizard",
    labels: ["UI/UX", "enhancement", "good first issue"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nNew users unfamiliar with prediction markets or Stellar wallets need guided onboarding. Without it, drop-off rates at the wallet connection step are high.\n\n## 📋 Guidelines\n- 4-step wizard: (1) Connect Wallet, (2) How Markets Work, (3) Place Your First Bet, (4) Understanding Payouts\n- Progress stepper visible at top of each step\n- Include a "Skip" option that jumps to the dashboard\n- Persist completion state in localStorage — don't show again once completed\n- Each step should have a short illustration or icon\n- Key requirement: 4-step Progress Stepper / Logic\n${DOD}`,
  },
  {
    title: '[UIUX] #131 — "What-If" Simulator',
    labels: ["UI/UX", "enhancement"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nUsers want to understand potential returns before committing funds. A simulator removes uncertainty and encourages larger, more confident stakes.\n\n## 📋 Guidelines\n- Add a collapsible simulator panel on the market detail page\n- Input: stake amount via slider or text field\n- Output: projected payout if correct, loss if wrong, based on current pool odds\n- Render results as a bar or line chart using Recharts\n- Update projections in real-time as user adjusts input\n- Show current implied probability alongside projected return\n- Key requirement: P&L Projections / Portfolio Charts\n${DOD}`,
  },
  {
    title: "[UIUX] #132 — High-Volatility Pulse",
    labels: ["UI/UX", "enhancement"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nIn fast-moving markets, users need an immediate visual signal when odds are shifting rapidly. A pulse animation draws attention without requiring users to constantly watch the numbers.\n\n## 📋 Guidelines\n- Trigger a pulse animation on market cards when odds change by >5% within 60 seconds\n- Use CSS @keyframes for a border or background glow pulse\n- Green pulse for rising YES odds, red for falling YES odds\n- Trigger threshold should be a configurable constant\n- Animation should run 3 cycles then stop — not loop indefinitely\n- Key requirement: CSS @keyframes / Color Logic\n${DOD}`,
  },
  {
    title: "[UIUX] #133 — Share Pizza Chart",
    labels: ["UI/UX", "enhancement"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nIn markets with a small number of large stakers, users want to see how the pool is distributed. A fractional ownership chart adds transparency and social context.\n\n## 📋 Guidelines\n- Render a pie chart using Recharts on the market detail page\n- Each slice represents one bettor's share of the total pool\n- Tooltip on hover shows abbreviated wallet address and exact stake amount\n- Chart should update live as new bets come in\n- Group wallets with <1% share into an "Others" slice to avoid clutter\n- Key requirement: Recharts / Fractional Ownership\n${DOD}`,
  },
  {
    title: "[UIUX] #134 — Market Discovery Cards",
    labels: ["UI/UX", "enhancement"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nUsers need a way to discover new markets relevant to their interests. Generic lists don't drive engagement — personalized, visually rich cards do.\n\n## 📋 Guidelines\n- Design cards with SVG category illustrations: Sports, Crypto, Finance, Politics, Weather\n- Suggestion logic: surface markets based on user's past category activity or trending volume\n- Cards should have a subtle hover lift effect (CSS transform + box-shadow)\n- Include market end date, current pool size, and category tag on each card\n- Trending markets should show a 🔥 Hot badge\n- Key requirement: SVG Illustrations / Suggestion Logic\n${DOD}`,
  },
  {
    title: "[UIUX] #135 — Priority Notification Inbox",
    labels: ["UI/UX", "enhancement"],
    body: `**Type:** UIUX\n\n## 🧩 Context\nUsers miss critical events like market resolution and payouts because there's no in-app alert system. A notification inbox keeps users informed and drives them back to claim winnings.\n\n## 📋 Guidelines\n- Build a notification dropdown accessible from the navbar\n- Notification types: Market Resolved, Payout Available, Market Ending in 1 Hour\n- Dropdown must render at z-index: 1100 to sit above all modals and overlays\n- Include read/unread state with a blue dot indicator\n- Include a "Clear All" button\n- Persist notification state in localStorage or backend\n- Key requirement: Inbox Logic / Z-index 1100\n${DOD}`,
  },
  // ── FRONTEND ───────────────────────────────────────────────────────────────
  {
    title: "[FE] #136 — Transaction Batching",
    labels: ["frontend", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nEvery separate contract call requires a Freighter wallet pop-up. For actions like "place bet + add trustline", this means 2 approvals. Batching reduces this to one, dramatically improving UX.\n\n## 📋 Guidelines\n- Use Freighter SDK's atomic transaction bundling API\n- Identify all common multi-step flows and batch them: bet + trustline, bet + fee approval\n- On batch failure, roll back cleanly and show a specific error message per failed operation\n- Expose a \`useBatchTransaction\` hook for reuse across components\n- Test on Stellar testnet before mainnet\n- Key requirement: Freighter SDK / Atomic Bundling\n${DOD}`,
  },
  {
    title: "[FE] #137 — Live Odds Sync",
    labels: ["frontend", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nStatic odds that only update on page refresh make the platform feel outdated. Real-time odds are a core expectation for any prediction market.\n\n## 📋 Guidelines\n- Connect to Mercury Indexer via WebSocket for live contract event streaming\n- Update odds on market cards and detail pages without full re-render\n- Show a subtle yellow flash animation when a value changes\n- Implement exponential backoff reconnect logic for dropped connections\n- Debounce rapid updates to avoid excessive re-renders (max 1 update per 500ms)\n- Key requirement: Mercury Indexer / WebSockets\n${DOD}`,
  },
  {
    title: "[FE] #138 — Client-Side Slippage",
    labels: ["frontend", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nXLM uses 7 decimal precision and market odds can shift between bet submission and confirmation. Without slippage protection, users can receive significantly worse payouts than expected.\n\n## 📋 Guidelines\n- Use BigInt math throughout to avoid floating point precision errors\n- Allow users to set slippage tolerance: 0.5%, 1%, 2%, or custom\n- Persist user's preferred slippage setting in localStorage\n- Before confirming a bet, compare current odds to odds at time of input\n- If drift exceeds tolerance, show a warning modal with option to proceed or cancel\n- Key requirement: BigInt Math / User Presets\n${DOD}`,
  },
  {
    title: "[FE] #139 — IPFS Resolver",
    labels: ["frontend", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nStoring full market metadata on-chain is expensive. IPFS allows rich descriptions, source links, and category data to be stored off-chain while keeping a content hash on-chain for verification.\n\n## 📋 Guidelines\n- Build a \`useIPFSMetadata(cid)\` hook using Pinata SDK\n- Fetch JSON metadata: description, category, source URLs, creator notes\n- Cache resolved metadata using React Query or SWR to avoid redundant fetches\n- Fall back to on-chain data if IPFS gateway is unavailable or times out (5s timeout)\n- Display a "Metadata unavailable" state gracefully\n- Key requirement: Pinata SDK / JSON Metadata Hook\n${DOD}`,
  },
  {
    title: "[FE] #140 — Form Persistence",
    labels: ["frontend", "enhancement", "good first issue"],
    body: `**Type:** FE\n\n## 🧩 Context\nUsers frequently lose their bet form inputs when accidentally navigating away or refreshing. This is a frustrating UX issue that leads to abandoned bets.\n\n## 📋 Guidelines\n- Persist: selected outcome index, stake amount, slippage setting\n- Use localStorage with a per-market key so different markets have independent state\n- Restore state on component mount\n- Clear persisted state on successful bet submission\n- Add a "Clear form" button for manual reset\n- Key requirement: LocalStorage / State Sync\n${DOD}`,
  },
  {
    title: "[FE] #141 — Virtualized Order Book",
    labels: ["frontend", "performance"],
    body: `**Type:** FE\n\n## 🧩 Context\nMarkets with hundreds of bets render thousands of DOM nodes in the order book, causing severe performance degradation on low-end devices common in target markets.\n\n## 📋 Guidelines\n- Use \`react-window\` with \`FixedSizeList\` for order book rows\n- Each row: wallet address (abbreviated), outcome, amount, timestamp\n- Implement dynamic data updates without full list re-render\n- Test with 500+ rows to confirm smooth scrolling\n- Add a "Load more" or infinite scroll trigger at the bottom\n- Key requirement: react-window / Performance\n${DOD}`,
  },
  {
    title: "[FE] #142 — Trustline Auto-Checker",
    labels: ["frontend", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nUsers trying to bet with custom Stellar assets fail silently if they don't have the required trustline. This is a common point of confusion for non-technical users.\n\n## 📋 Guidelines\n- Before bet submission, query Horizon API to check if the user's wallet has the required trustline\n- If missing, show a clear explanation: "Your wallet needs to trust [ASSET] before betting"\n- Automatically construct the trustline transaction and present it for one-click Freighter approval\n- After trustline is set, automatically resume the bet flow\n- Handle edge cases: wallet not connected, Horizon API timeout\n- Key requirement: Horizon API / Automatic Tx\n${DOD}`,
  },
  {
    title: "[FE] #143 — Bundle Size Audit",
    labels: ["frontend", "performance"],
    body: `**Type:** FE\n\n## 🧩 Context\nA large JavaScript bundle means slow initial load times, especially on mobile networks in African markets where 3G is common. Every KB matters.\n\n## 📋 Guidelines\n- Run Webpack Bundle Analyzer and document current bundle size\n- Implement route-based code splitting with \`next/dynamic\`\n- Tree-shake unused exports from large dependencies (Recharts, stellar-sdk)\n- Split vendor chunks from application code\n- Target: initial JS bundle below 200KB gzipped\n- Document all changes and their size impact in the PR\n- Key requirement: Webpack / Tree-shaking / Code-split\n${DOD}`,
  },
  {
    title: "[FE] #144 — Contract Error Boundary",
    labels: ["frontend", "bug", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nSoroban contract calls can fail for many reasons — insufficient balance, market closed, network timeout. Without proper error handling, users see cryptic errors or blank screens.\n\n## 📋 Guidelines\n- Wrap all contract interaction components in \`React.ErrorBoundary\`\n- Connect error state to Redux for global error tracking\n- Map common contract error codes to user-friendly messages\n- Log errors to a monitoring service (e.g. Sentry)\n- Show a retry button where appropriate\n- Key requirement: React.ErrorBoundary / Redux\n${DOD}`,
  },
  {
    title: "[FE] #145 — i18n Translation",
    labels: ["frontend", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nStella Polymarket targets global and African markets. Supporting local languages dramatically increases accessibility and trust for non-English speakers.\n\n## 📋 Guidelines\n- Integrate \`i18next\` with dynamic JSON loading\n- Priority languages: English, French, Yoruba, Hausa, Swahili\n- All UI strings must be extracted to translation JSON files\n- Language selection should persist in localStorage\n- Respect browser locale on first visit\n- Key requirement: i18next / Dynamic JSON Loading\n${DOD}`,
  },
  {
    title: "[FE] #146 — Mobile Pull-to-Refresh",
    labels: ["frontend", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nMobile users expect native pull-to-refresh behavior on list views. Without it, the only way to get fresh market data is a full page reload.\n\n## 📋 Guidelines\n- Implement pull-to-refresh gesture on the markets list\n- Use touch event listeners or \`react-pull-to-refresh\`\n- On trigger, re-fetch the markets list from the API and show a loading spinner\n- Ensure it doesn't conflict with normal vertical scroll behavior\n- Minimum pull distance: 60px before triggering\n- Key requirement: Swipe Gestures / List Re-fetch\n${DOD}`,
  },
  {
    title: "[FE] #147 — Skeleton Loading States",
    labels: ["frontend", "enhancement", "good first issue"],
    body: `**Type:** FE\n\n## 🧩 Context\nLoading spinners cause layout shift and feel jarring. Skeleton screens that match the layout of loading content improve perceived performance significantly.\n\n## 📋 Guidelines\n- Replace all loading spinners with CSS shimmer skeleton screens\n- Skeletons must match the exact layout of: market cards, order book rows, user portfolio\n- Use consistent shimmer animation timing across all skeletons\n- Ensure no Cumulative Layout Shift (CLS) when content loads in\n- Key requirement: CSS Shimmers / Layout Stability\n${DOD}`,
  },
  {
    title: "[FE] #148 — Clipboard Copy Utility",
    labels: ["frontend", "enhancement", "good first issue"],
    body: `**Type:** FE\n\n## 🧩 Context\nWallet addresses and transaction IDs are long and unwieldy. Users need a quick way to copy them without selecting text manually.\n\n## 📋 Guidelines\n- Build a reusable \`<CopyButton>\` component\n- Display abbreviated format: first 6 + last 4 chars (e.g. GABCD...1XYZ)\n- On click, copy full value to clipboard using the Clipboard API\n- Show a brief "Copied!" tooltip confirmation that fades after 2 seconds\n- Handle browsers that don't support Clipboard API gracefully\n- Key requirement: Address/TxID Abbreviation + Copy\n${DOD}`,
  },
  {
    title: "[FE] #149 — Dynamic Theming Engine",
    labels: ["frontend", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nA dark/light theme toggle is a baseline UX expectation. It also improves accessibility for users in bright environments.\n\n## 📋 Guidelines\n- Implement full dark/light theme using CSS custom properties (variables)\n- All colors, shadows, and backgrounds must reference CSS variables — no hardcoded values\n- Theme preference persists in localStorage\n- Provide a toggle button in the navbar\n- Respect \`prefers-color-scheme\` media query on first load\n- Key requirement: CSS Variables / Dark-Light Switch\n${DOD}`,
  },
  {
    title: "[FE] #150 — Search Filter Engine",
    labels: ["frontend", "enhancement"],
    body: `**Type:** FE\n\n## 🧩 Context\nAs the number of markets grows, users need a fast way to find relevant markets. A search and filter system is essential for discoverability at scale.\n\n## 📋 Guidelines\n- Implement fuzzy search across market titles using \`fuse.js\`\n- Support filtering by: category tags (Sports, Crypto, Finance, Politics), status (Live, Resolved, Ending Soon)\n- Support sorting by: volume, end date, newest\n- Search and filter state should be reflected in the URL query params\n- Results should update instantly as user types\n- Key requirement: Fuzzy Search / Category Tags\n${DOD}`,
  },
  // ── BACKEND ────────────────────────────────────────────────────────────────
  {
    title: "[BE] #151 — Binary Market Engine",
    labels: ["backend", "smart-contract", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nThe core smart contract is the foundation of the entire platform. It must be robust, gas-efficient, and fully tested before any other features can be built on top of it.\n\n## 📋 Guidelines\n- Implement binary (Yes/No) market contract in Soroban (Rust) with full token Wasm integration\n- Contract must handle: market creation, bet placement with token locking, resolution, proportional payout\n- Include unit tests for all state transitions\n- Run \`cargo audit\` and resolve all advisories before PR\n- Key requirement: Soroban (Rust) / Token Wasm\n${DOD}`,
  },
  {
    title: "[BE] #152 — Automated Resolver",
    labels: ["backend", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nMarkets need to be resolved automatically when their end date passes. Manual resolution is not scalable and introduces human error risk.\n\n## 📋 Guidelines\n- Build a Node.js cron job that polls active markets past their end date\n- Trigger resolution via oracle API calls per market type\n- Support multiple oracle types: price feeds, sports APIs, custom\n- Include retry logic with exponential backoff\n- Implement a dead-letter queue for failed resolutions\n- Provide an admin override endpoint for manual resolution\n- Key requirement: Node.js / Cron / Oracle API\n${DOD}`,
  },
  {
    title: "[BE] #153 — Circuit Breaker Lock",
    labels: ["backend", "smart-contract", "security"],
    body: `**Type:** BE\n\n## 🧩 Context\nAnomalous betting activity (e.g. flash loan attacks, coordinated manipulation) can drain market pools. A circuit breaker provides an automatic safety net.\n\n## 📋 Guidelines\n- Implement circuit breaker pattern in Soroban using persistent storage flags\n- Trigger condition: >50% pool movement within 60 seconds\n- When triggered: pause new bets on that market, emit a contract event\n- Admin can review and manually re-open or force-resolve the market\n- Must pass \`cargo audit\` security check\n- Key requirement: Soroban / Persistent Storage Safety\n${DOD}`,
  },
  {
    title: "[BE] #154 — Mercury Indexer Logic",
    labels: ["backend", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nQuerying the Stellar RPC directly for every user request is slow and rate-limited. Mercury Indexer provides a fast, queryable data layer for contract events.\n\n## 📋 Guidelines\n- Set up Mercury Indexer to index all Stella Polymarket contract events\n- Store indexed data in a GraphQL/SQL data store\n- Enable fast queries for: bet history, market stats, user portfolios\n- Document the full schema and provide example queries\n- Key requirement: GraphQL / SQL Data Store\n${DOD}`,
  },
  {
    title: "[BE] #155 — Dispute Voting",
    labels: ["backend", "smart-contract", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nOracles can be wrong. A dispute mechanism gives the community a way to challenge incorrect resolutions and protect users from bad outcomes.\n\n## 📋 Guidelines\n- Allow token holders to vote to challenge a market outcome within 24 hours post-resolution\n- Use weighted consensus: votes weighted by STELLA token holdings\n- If dispute passes threshold (e.g. >60% of voting weight), market enters re-review state\n- Payouts are paused during dispute window\n- Must pass \`cargo audit\` security check\n- Key requirement: Weighted Consensus / Voting Logic\n${DOD}`,
  },
  {
    title: "[BE] #156 — Gas Optimization",
    labels: ["backend", "smart-contract", "performance"],
    body: `**Type:** BE\n\n## 🧩 Context\nHigh contract execution costs make small bets economically unviable. Optimizing storage patterns directly reduces costs for all users.\n\n## 📋 Guidelines\n- Audit all Soroban contracts and refactor storage from Map to Vec where appropriate\n- Profile contract execution costs using Soroban's budget tracking tools\n- Target: reduce average contract call cost by 30%\n- Document all changes with before/after cost metrics in the PR\n- Must pass \`cargo audit\` security check\n- Key requirement: Storage Map → Vec Refactor\n${DOD}`,
  },
  {
    title: "[BE] #157 — Market Creation Fee",
    labels: ["backend", "smart-contract", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nWithout a creation fee, the platform is vulnerable to spam markets that pollute the discovery feed and waste oracle resources.\n\n## 📋 Guidelines\n- Implement a configurable market creation fee in the Soroban contract\n- Fee amount is set by DAO governance vote\n- Fee is either burned or transferred to the DAO treasury address\n- Fee config must be updatable by admin without redeploying the contract\n- Must pass \`cargo audit\` security check\n- Key requirement: XLM Burn / DAO Transfer Logic\n${DOD}`,
  },
  {
    title: "[BE] #158 — Oracle Medianizer",
    labels: ["backend", "enhancement", "security"],
    body: `**Type:** BE\n\n## 🧩 Context\nRelying on a single oracle is a critical security vulnerability. A medianizer aggregates multiple sources and filters outliers, making manipulation significantly harder.\n\n## 📋 Guidelines\n- Pull price/outcome data from 3+ independent oracle sources\n- Compute the median value across all sources\n- Implement outlier detection: discard values >2 standard deviations from the median\n- Log all source values and the computed median for auditability\n- Must pass \`cargo audit\` security check\n- Key requirement: Multi-Feed Aggregator / Outlier Check\n${DOD}`,
  },
  {
    title: "[BE] #159 — Liquidity Bot Hook",
    labels: ["backend", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nNew markets often start with low liquidity, making odds unreliable and discouraging participation. Automated liquidity bots can seed initial pools and maintain healthy depth.\n\n## 📋 Guidelines\n- Implement an event-driven hook system triggered on: new market creation, pool depth below threshold\n- Architecture must be modular — different bot strategies pluggable without changing core contract\n- Bots should operate within configurable risk parameters\n- Include monitoring and kill-switch for each bot instance\n- Key requirement: Event-Driven Architecture\n${DOD}`,
  },
  {
    title: "[BE] #160 — TVL Monitoring Service",
    labels: ["backend", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nTotal Value Locked is the primary health metric for a DeFi protocol. Real-time TVL monitoring enables rapid response to anomalies and builds user trust through transparency.\n\n## 📋 Guidelines\n- Aggregate all active market pool balances in real-time\n- Expose metrics via a Prometheus endpoint\n- Connect to a Grafana dashboard for visualization\n- Alert on sudden TVL drops >20% within a 5-minute window\n- Key requirement: Real-time Dashboard / Prometheus\n${DOD}`,
  },
  {
    title: "[BE] #161 — Ledger Event Scraper",
    labels: ["backend", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nMercury Indexer may have gaps or downtime. An independent ledger scraper provides a complete, tamper-proof audit trail of all contract interactions.\n\n## 📋 Guidelines\n- Write a Go service that scrapes Stellar ledger events ledger-by-ledger\n- Archive all Stella Polymarket contract interactions to a persistent store\n- Use goroutines for parallel ledger processing to keep up with chain speed\n- Include a catch-up mode for processing historical ledgers\n- Key requirement: Go / Ledger-by-Ledger Archiving\n${DOD}`,
  },
  {
    title: "[BE] #162 — Vault Re-balancing",
    labels: ["backend", "smart-contract", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nUnclaimed payouts from resolved markets sit idle in the contract. Putting these funds to work via yield strategies benefits the protocol and its token holders.\n\n## 📋 Guidelines\n- Sweep unclaimed funds from markets resolved >30 days ago into a yield vault\n- Re-invest via Stellar's AMM pools automatically\n- Original claimants can still withdraw their payout at any time — yield is protocol revenue\n- Must pass \`cargo audit\` security check\n- Key requirement: Soroban / Automated Yield Re-invest\n${DOD}`,
  },
  {
    title: "[BE] #163 — Audit Logging",
    labels: ["backend", "security", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nAdmin and oracle actions (market creation, resolution, fee changes) must be auditable. Immutable logs stored on IPFS with on-chain hashes provide tamper-proof accountability.\n\n## 📋 Guidelines\n- Log all admin and oracle actions with timestamp, actor, and action details\n- Store logs on IPFS; record content hash on-chain for verification\n- Expose a public audit log viewer in the UI\n- Must pass \`cargo audit\` security check\n- Key requirement: Immutable Tx History / IPFS Logs\n${DOD}`,
  },
  {
    title: "[BE] #164 — Permissionless Launch",
    labels: ["backend", "enhancement"],
    body: `**Type:** BE\n\n## 🧩 Context\nRequiring admin approval for every market doesn't scale. Permissionless market creation with automated validation enables community-driven growth.\n\n## 📋 Guidelines\n- Implement automated metadata verification on market submission\n- Validation rules: no duplicate questions, valid end date (>1 hour from now), minimum description length (50 chars), valid outcome count (2-5)\n- Spam/invalid markets rejected with a clear, specific error response\n- Rate limit: max 3 market creations per wallet per 24 hours\n- Key requirement: Automated Metadata Verification\n${DOD}`,
  },
  {
    title: "[BE] #165 — Throughput Stress Test",
    labels: ["backend", "testing", "performance"],
    body: `**Type:** BE\n\n## 🧩 Context\nThe platform must handle peak traffic without degradation. A comprehensive stress test suite identifies bottlenecks before they affect real users.\n\n## 📋 Guidelines\n- Write load tests using Taurus with Go-routine based concurrent users\n- Test targets: 500 concurrent bets, market resolution under load, WebSocket connection limits\n- Document results: throughput (req/s), p95 latency, error rate\n- Identify all bottlenecks and provide recommended fixes\n- Include the test suite in CI so regressions are caught automatically\n- Key requirement: Taurus / Go-routine Load Testing\n${DOD}`,
  },
];

async function main() {
  console.log(`Creating ${issues.length} issues on ${OWNER}/${REPO}...`);
  for (const issue of issues) {
    await createIssue(issue.title, issue.body, issue.labels);
    // Respect GitHub rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log("All issues created.");
}

main();
