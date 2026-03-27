'use strict';

/**
 * sportsApi.js — API-Football v3 client
 *
 * Fetches finished match results for a given team name.
 * All network calls go through this module so they can be mocked in tests.
 *
 * Environment variables:
 *   SPORTS_API_URL  — base URL (default: https://v3.football.api-sports.io)
 *   SPORTS_API_KEY  — API-Football API key (required in production)
 */

const axios = require('axios');

const BASE_URL = process.env.SPORTS_API_URL || 'https://v3.football.api-sports.io';
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Build axios headers. Key is read from env at call time so tests can
 * override process.env without module re-import.
 */
function headers() {
  const key = process.env.SPORTS_API_KEY;
  if (!key) throw new Error('SPORTS_API_KEY environment variable is not set');
  return { 'x-apisports-key': key };
}

/**
 * Search for a team by name.
 * Returns the first matching team object or null.
 *
 * @param {string} teamName
 * @returns {Promise<{id: number, name: string}|null>}
 */
async function findTeam(teamName) {
  const res = await axios.get(`${BASE_URL}/teams`, {
    params: { search: teamName },
    headers: headers(),
    timeout: REQUEST_TIMEOUT_MS,
  });
  return res.data?.response?.[0]?.team ?? null;
}

/**
 * Fetch the most recent finished fixture for a team.
 * Returns the fixture object or null if none found.
 *
 * @param {number} teamId
 * @returns {Promise<object|null>}
 */
async function getLastFinishedFixture(teamId) {
  const res = await axios.get(`${BASE_URL}/fixtures`, {
    params: { team: teamId, last: 1, status: 'FT' },
    headers: headers(),
    timeout: REQUEST_TIMEOUT_MS,
  });
  return res.data?.response?.[0] ?? null;
}

/**
 * Determine whether a team won their last finished match.
 *
 * @param {string} teamName
 * @returns {Promise<{won: boolean, fixture: object, team: object}>}
 * @throws if team not found or no finished fixtures available
 */
async function didTeamWin(teamName) {
  const team = await findTeam(teamName);
  if (!team) throw new Error(`Team not found: "${teamName}"`);

  const fixture = await getLastFinishedFixture(team.id);
  if (!fixture) throw new Error(`No finished fixtures for team: "${teamName}"`);

  const isHome = fixture.teams.home.id === team.id;
  const teamGoals = isHome ? fixture.goals.home : fixture.goals.away;
  const oppGoals  = isHome ? fixture.goals.away : fixture.goals.home;
  const won = teamGoals > oppGoals;

  return { won, fixture, team };
}

module.exports = { findTeam, getLastFinishedFixture, didTeamWin };
