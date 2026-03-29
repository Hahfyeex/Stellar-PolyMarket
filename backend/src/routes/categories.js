const express = require("express");
const router = express.Router();
const db = require("../db");
const logger = require("../utils/logger");

// GET /api/categories — list all categories with active market counts
router.get("/", async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id, 
        c.name, 
        c.slug, 
        c.icon_name,
        COUNT(m.id)::int as market_count
      FROM categories c
      LEFT JOIN markets m ON c.id = m.category_id AND m.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY c.name ASC
    `;
    
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "Failed to fetch categories");
    res.status(500).json({ 
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to fetch categories",
        details: err.message
      }
    });
  }
});

module.exports = router;
