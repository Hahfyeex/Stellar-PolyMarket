const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');

// GET /api/markets/:id/comments - Fetch comments for a market
router.get('/:id/comments', async (req, res) => {
    const marketId = parseInt(req.params.id);
    
    try {
        const result = await db.query(
            'SELECT * FROM market_comments WHERE market_id = $1 ORDER BY created_at ASC',
            [marketId]
        );
        
        res.json({
            status: 'success',
            data: result.rows
        });
    } catch (err) {
        logger.error({ err, marketId }, 'Failed to fetch market comments');
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/markets/:id/comments - Post a new comment
router.post('/:id/comments', async (req, res) => {
    const marketId = parseInt(req.params.id);
    const { text, walletAddress } = req.body;

    if (!text || !walletAddress) {
        return res.status(400).json({ error: 'text and walletAddress are required' });
    }

    if (text.length > 500) {
        return res.status(400).json({ error: 'Comment must be 500 characters or less' });
    }

    try {
        const result = await db.query(
            'INSERT INTO market_comments (market_id, wallet_address, text) VALUES ($1, $2, $3) RETURNING *',
            [marketId, walletAddress, text]
        );

        res.status(201).json({
            status: 'success',
            data: result.rows[0]
        });
    } catch (err) {
        logger.error({ err, marketId, walletAddress }, 'Failed to post market comment');
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/markets/comments/:id/thumbs-up - Thumbs up a comment
router.post('/comments/:id/thumbs-up', async (req, res) => {
    const commentId = parseInt(req.params.id);

    try {
        const result = await db.query(
            'UPDATE market_comments SET thumbs_up_count = thumbs_up_count + 1 WHERE id = $1 RETURNING *',
            [commentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        res.json({
            status: 'success',
            data: result.rows[0]
        });
    } catch (err) {
        logger.error({ err, commentId }, 'Failed to thumbs up comment');
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
