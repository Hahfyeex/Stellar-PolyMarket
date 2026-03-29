/**
 * graphql/schema.js
 *
 * GraphQL type definitions — Apollo Server compatible (plain SDL string).
 * Covers: Market, Bet, User, Category, Event types with all relevant fields.
 */

"use strict";

const typeDefs = /* GraphQL */ `
  type Category {
    name: String!
    market_count: Int!
  }

  type Market {
    id: Int!
    question: String!
    outcomes: [String!]!
    end_date: String!
    resolved: Boolean!
    winning_outcome: Int
    total_pool: String!
    status: String!
    category: String
    contract_address: String
    created_at: String!
    bet_count: Int
    bets: [Bet!]
  }

  type Bet {
    id: Int!
    market_id: Int!
    wallet_address: String!
    outcome_index: Int!
    amount: String!
    paid_out: Boolean!
    created_at: String!
    market: Market
  }

  type User {
    wallet_address: String!
    total_staked: String!
    total_won: String!
    bet_count: Int!
    win_count: Int!
    first_seen: String!
    last_seen: String!
    bets: [Bet!]
  }

  type LeaderboardEntry {
    rank: Int!
    wallet_address: String!
    total_bets: Int!
    wins: Int
    accuracy_pct: String
    total_volume_xlm: String
    total_winnings_xlm: String
  }

  type Event {
    id: Int!
    contract_id: String!
    topic: String!
    payload: String!
    ledger_seq: Int!
    ledger_time: String!
    tx_hash: String!
    event_index: Int!
    created_at: String!
  }

  type MarketStats {
    market_id: Int!
    total_pool: String!
    bet_count: Int!
    unique_bettors: Int!
    outcome_stakes: [OutcomeStake!]!
  }

  type OutcomeStake {
    outcome_index: Int!
    total_stake: String!
    bet_count: Int!
  }

  type Query {
    market(id: Int!): Market
    markets(status: String, category: String, limit: Int, offset: Int): [Market!]!
    bets(market_id: Int, wallet_address: String, limit: Int, offset: Int): [Bet!]!
    betsByWallet(wallet_address: String!, limit: Int, offset: Int): [Bet!]!
    betsByMarket(market_id: Int!, limit: Int, offset: Int): [Bet!]!
    marketStats(market_id: Int!): MarketStats
    user(wallet_address: String!): User
    leaderboard(type: String, limit: Int, offset: Int): [LeaderboardEntry!]!
    events(contract_id: String, topic: String, limit: Int, offset: Int): [Event!]!
    categories: [Category!]!
  }

  type BetPlacedEvent {
    market_id: Int!
    wallet_address: String!
    outcome_index: Int!
    amount: String!
  }

  type MarketResolvedEvent {
    market_id: Int!
    winning_outcome: Int!
    total_pool: String!
  }

  type OddsChangedEvent {
    market_id: Int!
    odds_bps: [String!]!
  }

  type Subscription {
    onBetPlaced(marketId: Int!): BetPlacedEvent!
    onMarketResolved(marketId: Int!): MarketResolvedEvent!
    onOddsChanged(marketId: Int!): OddsChangedEvent!
  }
`;

module.exports = { typeDefs };
