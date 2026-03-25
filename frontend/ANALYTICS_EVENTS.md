# Firebase Analytics Events

This document outlines the custom events tracked in Stella Polymarket for understanding user behavior and identifying drop-off points.

## Top 5 Custom Events Tracked

### 1. `begin_checkout`
**Trigger**: When user opens the bet modal (TradeDrawer)
**Purpose**: Track user intent to place bets
**Parameters**:
- `market_id`: Unique identifier of the market
- `market_question`: Truncated market question (first 50 chars)
- `total_pool`: Current pool size in XLM
- `outcomes_count`: Number of possible outcomes
- `market_resolved`: Whether the market is resolved
- `session_id`: Anonymous session identifier
- `timestamp`: Event timestamp

**Why Important**: Shows which markets attract betting interest and potential conversion funnels.

### 2. `share_market`
**Trigger**: When user clicks the share button on a market card
**Purpose**: Track content virality and user engagement
**Parameters**:
- `market_id`: Unique identifier of the market
- `share_method`: "native_share_api" or "clipboard"
- `market_question`: Truncated market question (first 50 chars)
- `session_id`: Anonymous session identifier
- `timestamp`: Event timestamp

**Why Important**: Identifies which markets are worth sharing and measures organic growth potential.

### 3. `help_doc_read`
**Trigger**: When user clicks the help button in navigation
**Purpose**: Track user confusion and need for assistance
**Parameters**:
- `source`: Where the help was triggered from (e.g., "navbar_help_button")
- `user_wallet_connected`: Whether user has wallet connected
- `session_id`: Anonymous session identifier
- `timestamp`: Event timestamp

**Why Important**: Reveals UI/UX friction points and helps improve user onboarding.

### 4. `slippage_changed`
**Trigger**: When users encounter transaction failures (slippage-related)
**Purpose**: Track technical issues affecting user experience
**Parameters**:
- `failure_type`: Type of failure (e.g., "transaction_failed")
- `failure_reason`: Reason for failure (e.g., "slippage_or_network_congestion")
- `user_action`: Action taken by user (e.g., "viewed_error_screen", "try_again_clicked")
- `session_id`: Anonymous session identifier
- `timestamp`: Event timestamp

**Why Important**: Identifies technical barriers to successful transactions and network issues.

### 5. `bet_placed`
**Trigger**: When a user successfully places a bet
**Purpose**: Track conversion success and user engagement
**Parameters**:
- `market_id`: Unique identifier of the market
- `outcome_index`: Index of the chosen outcome
- `amount`: Bet amount in XLM
- `outcome_name`: Name of the chosen outcome
- `session_id`: Anonymous session identifier
- `timestamp`: Event timestamp

**Why Important**: Measures successful conversions and user betting patterns.

## Additional Events

### `bet_error`
**Trigger**: When bet placement fails
**Purpose**: Track conversion barriers and error patterns

### `share_error`
**Trigger**: When market sharing fails
**Purpose**: Track technical issues with sharing functionality

## Privacy Compliance

- **No PII**: No wallet addresses, personal information, or identifying data is logged
- **Anonymous Sessions**: Users are tracked via anonymous session IDs stored in sessionStorage
- **Data Sanitization**: Long strings and potential wallet addresses are automatically filtered out
- **Minimal Data**: Only essential behavioral data is collected

## Implementation Details

- **SDK**: Firebase Analytics modular SDK for optimal bundle size
- **Privacy-First**: All events are sanitized to prevent PII leakage
- **Session-Based**: Uses sessionStorage for anonymous session persistence
- **Error Tracking**: Includes comprehensive error event tracking

## Usage in Analysis

These events help answer:
- Where do users drop off in the betting funnel?
- Which markets generate the most engagement?
- What technical issues prevent successful transactions?
- How often do users need help documentation?
- What content drives organic sharing?

This data enables data-driven UI/UX improvements and feature prioritization.
