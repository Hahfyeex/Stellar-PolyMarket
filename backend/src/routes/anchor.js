const express = require("express");
const axios = require("axios");
const jwtAuth = require("../middleware/jwtAuth");
const logger = require("../utils/logger");

const router = express.Router();
router.use(jwtAuth);

const ANCHOR_BASE_URL = process.env.ANCHOR_BASE_URL || "https://demo-anchor.stellar.org";
const SUPPORTED_ASSETS = (process.env.ANCHOR_SUPPORTED_ASSETS
  ? JSON.parse(process.env.ANCHOR_SUPPORTED_ASSETS)
  : ["XLM", "NGN", "KES", "GHS"]);
const DEPOSIT_LIMITS = { min: 1, max: 10000 };
const WITHDRAW_LIMITS = { min: 1, max: 5000 };

/** GET /api/anchor/info */
router.get("/info", async (req, res) => {
  res.json({
    supported_assets: SUPPORTED_ASSETS,
    deposit: DEPOSIT_LIMITS,
    withdrawal: WITHDRAW_LIMITS,
    interactive_deposit_endpoint: `${ANCHOR_BASE_URL}/sep24/interactive/deposit`,
    interactive_withdraw_endpoint: `${ANCHOR_BASE_URL}/sep24/interactive/withdraw`,
  });
});

/** POST /api/anchor/deposit */
router.post("/deposit", async (req, res) => {
  const { wallet, asset, amount } = req.body;

  if (!wallet || !asset) {
    return res.status(400).json({ error: "wallet and asset are required" });
  }

  if (!SUPPORTED_ASSETS.includes(asset)) {
    return res.status(400).json({ error: `Unsupported asset ${asset}` });
  }

  const interactiveUrl = `${ANCHOR_BASE_URL}/sep24/interactive/deposit?asset_code=${encodeURIComponent(
    asset
  )}&account=${encodeURIComponent(wallet)}${amount ? `&amount=${encodeURIComponent(amount)}` : ""}`;

  try {
    // In the real implementation we'd call the anchor's SEP-24 /transactions endpoint first.
    return res.json({ url: interactiveUrl });
  } catch (err) {
    logger.error({ err: err.message }, "Anchor deposit initiation failed");
    return res.status(502).json({ error: "Failed to initiate anchor deposit" });
  }
});

/** GET /api/anchor/transactions */
router.get("/transactions", async (req, res) => {
  const wallet = req.query.wallet;
  if (!wallet) {
    return res.status(400).json({ error: "wallet query parameter is required" });
  }

  try {
    const response = await axios.get(`${ANCHOR_BASE_URL}/sep24/transactions`, {
      params: { account: wallet },
      timeout: 10000,
    });

    return res.json({ transactions: response.data });
  } catch (err) {
    logger.error({ err: err.message }, "Anchor transactions fetch failed");
    return res.status(502).json({ error: "Failed to fetch anchor transactions" });
  }
});

module.exports = router;
