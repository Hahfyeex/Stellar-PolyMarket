const express = require("express");
const router = express.Router();
const db = require("../db");

// Characters excluding ambiguous ones (0, O, I, l)
const SAFE_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnopqrstuvwxyz";

// Offensive 3-letter combos to reject
const BLOCKED_PATTERNS = [
  /ass/i, /fuk/i, /fck/i, /sht/i, /dik/i, /fag/i, /nig/i, /cum/i,
  /wtf/i, /stf/i, /sex/i, /xxx/i, /69/,
];

/**
 * Generate a random 6-character alphanumeric code.
 * Excludes ambiguous characters (0, O, I, l) and offensive combos.
 */
function generateShortCode() {
  let code;
  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
    }
  } while (BLOCKED_PATTERNS.some((p) => p.test(code)));
  return code;
}

// POST /api/short-url — create short URL for a market
router.post("/", async (req, res) => {
  const { marketId } = req.body;
  if (!marketId) {
    return res.status(400).json({ error: "marketId is required" });
  }
  try {
    // Verify market exists
    const market = await db.query("SELECT id FROM markets WHERE id = $1", [marketId]);
    if (!market.rows.length) {
      return res.status(404).json({ error: "Market not found" });
    }

    // Check if short URL already exists for this market
    const existing = await db.query(
      "SELECT * FROM short_urls WHERE market_id = $1",
      [marketId]
    );
    if (existing.rows.length) {
      const baseUrl = process.env.BASE_URL || "http://localhost:4000";
      return res.json({
        shortUrl: `${baseUrl}/s/${existing.rows[0].short_code}`,
        shortCode: existing.rows[0].short_code,
      });
    }

    const shortCode = generateShortCode();
    const fullUrl = `/api/markets/${marketId}`;
    const baseUrl = process.env.BASE_URL || "http://localhost:4000";

    const result = await db.query(
      "INSERT INTO short_urls (short_code, market_id, full_url) VALUES ($1, $2, $3) RETURNING *",
      [shortCode, marketId, fullUrl]
    );

    res.status(201).json({
      shortUrl: `${baseUrl}/s/${result.rows[0].short_code}`,
      shortCode: result.rows[0].short_code,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/short-url/:code — get info about a short URL
router.get("/:code", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM short_urls WHERE short_code = $1",
      [req.params.code]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Short URL not found" });
    }
    const baseUrl = process.env.BASE_URL || "http://localhost:4000";
    res.json({
      shortCode: result.rows[0].short_code,
      marketId: result.rows[0].market_id,
      fullUrl: result.rows[0].full_url,
      shortUrl: `${baseUrl}/s/${result.rows[0].short_code}`,
      createdAt: result.rows[0].created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Redirect handler — mounted separately as GET /s/:code
async function redirectHandler(req, res) {
  try {
    const result = await db.query(
      "SELECT full_url FROM short_urls WHERE short_code = $1",
      [req.params.code]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Short URL not found" });
    }
    res.redirect(301, result.rows[0].full_url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = router;
module.exports.redirectHandler = redirectHandler;
module.exports.generateShortCode = generateShortCode;
module.exports.SAFE_CHARS = SAFE_CHARS;
module.exports.BLOCKED_PATTERNS = BLOCKED_PATTERNS;
