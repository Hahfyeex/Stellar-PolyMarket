const express = require('express');
const router = express.Router();
const db = require('../db');
const { SorobanRpc } = require('@stellar/stellar-sdk');
const logger = require('../utils/logger');

// Retrieve RPC URL, fallback to Testnet if not present
const RPC_URL = process.env.RPC_URL || 'https://soroban-testnet.stellar.org';

/**
 * Helper to ping a specific Stellar network endpoint.
 */
async function pingStellar() {
    const startTime = Date.now();
    try {
        const server = new SorobanRpc.Server(RPC_URL);
        // We consider getting the latest ledger a valid "ping" to the Soroban RPC
        await server.getLatestLedger();
        return {
            status: 'up',
            latency: Date.now() - startTime
        };
    } catch (e) {
        logger.error(`Stellar ping failed: ${e.message}`);
        return {
            status: 'down',
            latency: null,
            error: e.message
        };
    }
}

/**
 * Helper to ping the Postgres Database.
 */
async function pingDatabase() {
    const startTime = Date.now();
    try {
        await db.query('SELECT 1');
        return {
            status: 'up',
            latency: Date.now() - startTime
        };
    } catch (e) {
        logger.error(`Database ping failed: ${e.message}`);
        return {
            status: 'down',
            latency: null,
            error: e.message
        };
    }
}

/**
 * GET /api/status
 * Returns system health including DB latency and Stellar RPC latency.
 */
router.get('/', async (req, res) => {
    // Determine overall uptime
    const uptimeInSeconds = Math.floor(process.uptime());

    // Gather dependencies telemetry in parallel
    const [dbResult, stellarResult] = await Promise.all([
        pingDatabase(),
        pingStellar()
    ]);

    // Determine overall system status
    let systemStatus = 'up';
    if (dbResult.status === 'down' && stellarResult.status === 'down') {
        systemStatus = 'down';
    } else if (dbResult.status === 'down' || stellarResult.status === 'down') {
        systemStatus = 'degraded';
    }

    const payload = {
        status: systemStatus,
        uptime: uptimeInSeconds,
        services: {
            database: dbResult,
            stellar: stellarResult
        },
        timestamp: new Date().toISOString()
    };

    // If completely down, return 503 Service Unavailable, else 200 OK.
    const statusCode = systemStatus === 'down' ? 503 : 200;
    
    return res.status(statusCode).json(payload);
});

module.exports = router;
