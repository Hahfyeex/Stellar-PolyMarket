const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Ensure cache directory exists
const CACHE_DIR = path.join(__dirname, '../../cache');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * GET /api/images/proxy?url=...
 * Proxies the requested image URL, aggressively resizes it, converts to WebP,
 * and caches it to disk. Target: Under 50KB for poor connections.
 */
router.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    // Create a deterministic cache key based on the URL
    const hash = crypto.createHash('md5').update(targetUrl).digest('hex');
    const cachedImagePath = path.join(CACHE_DIR, `${hash}.webp`);

    try {
        // Serve from cache if it exists
        if (fs.existsSync(cachedImagePath)) {
            logger.info(`Serving cached WebP for ${targetUrl}`);
            return res.sendFile(cachedImagePath);
        }

        // Fetch the remote image into memory
        const response = await axios.get(targetUrl, { 
            responseType: 'arraybuffer',
            timeout: 8000
        });
        
        const buffer = Buffer.from(response.data, 'binary');

        // Optimize the image strongly with sharp
        const optimizedBuffer = await sharp(buffer)
            .resize({
                width: 800,
                // height is auto-calculated to maintain aspect ratio
                withoutEnlargement: true
            })
            .webp({ 
                quality: 60, // aggressive compression threshold for 3G target constraints
                effort: 6 
            })
            .toBuffer();

        // Save it to cache
        fs.writeFileSync(cachedImagePath, optimizedBuffer);
        
        logger.info(`Successfully proxied and compressed ${targetUrl} (Original: ${buffer.length}b, Optimized: ${optimizedBuffer.length}b)`);

        // Serve it
        res.set('Content-Type', 'image/webp');
        res.set('Cache-Control', 'public, max-age=31536000'); // Tell client to heavily cache it too
        return res.send(optimizedBuffer);

    } catch (err) {
        logger.error(`Failed to proxy image ${targetUrl}: ${err.message}`);
        return res.status(502).json({ error: 'Failed to fetch or process external image' });
    }
});

module.exports = router;
