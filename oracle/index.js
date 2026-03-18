require("dotenv").config();
const axios = require("axios");

const API_URL = process.env.API_URL || "http://localhost:4000";

/**
 * Fetch all unresolved, expired markets and resolve them
 */
async function runOracle() {
  console.log("[Oracle] Checking for markets to resolve...");
  try {
    const { data } = await axios.get(`${API_URL}/api/markets`);
    const now = Date.now();

    const expired = data.markets.filter(
      (m) => !m.resolved && new Date(m.end_date).getTime() <= now
    );

    console.log(`[Oracle] Found ${expired.length} market(s) to resolve`);

    for (const market of expired) {
      await resolveMarket(market);
    }
  } catch (err) {
    console.error("[Oracle] Error:", err.message);
  }
}

async function resolveMarket(market) {
  console.log(`[Oracle] Resolving market #${market.id}: "${market.question}"`);
  try {
    const winningOutcome = await fetchOutcome(market.question, market.outcomes);
    await axios.post(`${API_URL}/api/markets/${market.id}/resolve`, { winningOutcome });
    console.log(`[Oracle] Market #${market.id} resolved → outcome index: ${winningOutcome}`);
  } catch (err) {
    console.error(`[Oracle] Failed to resolve market #${market.id}:`, err.message);
  }
}

/**
 * Determine winning outcome based on question type.
 * Extend this with real API integrations per category.
 */
async function fetchOutcome(question, outcomes) {
  const q = question.toLowerCase();

  if (q.includes("bitcoin") || q.includes("btc") || q.includes("price")) {
    return await resolveCryptoPrice(question, outcomes);
  }

  if (q.includes("inflation") || q.includes("ngn") || q.includes("usd")) {
    return await resolveFinancial(question, outcomes);
  }

  // Default: return 0 (first outcome) — replace with real logic
  console.warn(`[Oracle] No resolver matched for: "${question}" — defaulting to outcome 0`);
  return 0;
}

async function resolveCryptoPrice(question, outcomes) {
  try {
    const { data } = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    );
    const btcPrice = data.bitcoin.usd;
    console.log(`[Oracle] BTC price: $${btcPrice}`);

    // Example: "Will Bitcoin reach $100k?" → Yes=0, No=1
    if (question.toLowerCase().includes("100k") || question.includes("100,000")) {
      return btcPrice >= 100000 ? 0 : 1;
    }
    return 0;
  } catch (err) {
    console.error("[Oracle] Crypto price fetch failed:", err.message);
    return 0;
  }
}

async function resolveFinancial(question, outcomes) {
  // Placeholder — integrate with a financial data API (e.g. ExchangeRate-API)
  console.warn("[Oracle] Financial resolver not yet integrated — defaulting to outcome 0");
  return 0;
}

// Run oracle every 60 seconds
runOracle();
setInterval(runOracle, 60 * 1000);
