/**
 * graphql/schema.js
 *
 * GraphQL type definitions for the Mercury Indexer data layer.
 * Covers: markets, bets, users, events.
 */

const { createSchema } = require('graphql-yoga');
const resolvers = require('./resolvers');

const typeDefs = /* GraphQL */ `
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
    # Aggregated bet stats for this market
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
    # All bets placed by this user
    bets: [Bet!]
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
    # Stake per outcome index
    outcome_stakes: [OutcomeStake!]!
  }

  type OutcomeStake {
    outcome_index: Int!
    total_stake: String!
    bet_count: Int!
  }

  type Query {
    # Single market by id
    market(id: Int!): Market

    # All markets, optionally filtered
    markets(status: String, category: String, limit: Int, offset: Int): [Market!]!

    # Bet history for a wallet (user portfolio)
    betsByWallet(wallet_address: String!, limit: Int, offset: Int): [Bet!]!

    # All bets for a market
    betsByMarket(market_id: Int!, limit: Int, offset: Int): [Bet!]!

    # Aggregated stats for a market
    marketStats(market_id: Int!): MarketStats

    # User profile + aggregate stats
    user(wallet_address: String!): User

    # Raw event log, filterable by topic
    events(contract_id: String, topic: String, limit: Int, offset: Int): [Event!]!
  }
`;

const schema = createSchema({ typeDefs, resolvers });

module.exports = schema;
