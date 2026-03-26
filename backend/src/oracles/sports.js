/**
 * oracles/sports.js — Sports result oracle
 *
 * Fetches match results from the API-Football v3 endpoint and determines
 * the winning outcome for a sports prediction market.
 *
 * Expected market question format:
 *   "Will Arsenal win the Premier League?"
 *   outcomes: ["Yes", "No"]
 *
 * The oracle searches for the team name in the question, fetches their
 * latest finished fixture, and returns outcome 0 ("Yes") if they won,
 * or 1 ("No") otherwise.
 */

const axios = require('axios');

const SPORTS_BASE = process.env.SPORTS_API_URL || 'https://v3.football.api-sports.io';
const SPORTS_API_KEY = process.env.SPORTS_API_KEY || '';

/**
 * Extract a team name from a market question.
 * Looks for "Will <Team> win" pattern.
 */
function parseQuestion(question) {
  const match = question.match(/Will\s+(.+?)\s+win/i);
  return match ? match[1].trim() : null;
}

/**
 * Resolve a sports market by checking the team's latest result.
 * @param {object} market
 * @returns {Promise<number>} 0 if team won, 1 if not
 */
async function resolve(market) {
  const teamName = parseQuestion(market.question);
  if (!teamName) {
    throw new Error(`Cannot parse team name from question: "${market.question}"`);
  }

  // Search for the team
  const searchRes = await axios.get(`${SPORTS_BASE}/teams`, {
    params: { search: teamName },
    headers: { 'x-apisports-key': SPORTS_API_KEY },
    timeout: 5000,
  });

  const team = searchRes.data?.response?.[0]?.team;
  if (!team) {
    throw new Error(`Team not found: ${teamName}`);
  }

  // Get their last finished fixture
  const fixturesRes = await axios.get(`${SPORTS_BASE}/fixtures`, {
    params: { team: team.id, last: 1, status: 'FT' },
    headers: { 'x-apisports-key': SPORTS_API_KEY },
    timeout: 5000,
  });

  const fixture = fixturesRes.data?.response?.[0];
  if (!fixture) {
    throw new Error(`No finished fixtures found for team: ${teamName}`);
  }

  const { home, away } = fixture.teams;
  const isHome = home.id === team.id;
  const teamGoals = isHome ? fixture.goals.home : fixture.goals.away;
  const oppGoals = isHome ? fixture.goals.away : fixture.goals.home;

  // outcome 0 = "Yes" (won), outcome 1 = "No"
  return teamGoals > oppGoals ? 0 : 1;
}

module.exports = { resolve, parseQuestion };
