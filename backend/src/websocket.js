const { Server } = require('socket.io');
const db = require('./db');
const logger = require('./utils/logger');

let io;

/**
 * Initializes the Socket.io server on the given HTTP server instance.
 */
function initWebSocket(server) {
    io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        logger.info(`New client connected: ${socket.id}`);

        // Join a specific market room to receive odds updates
        socket.on('joinMarket', (marketId) => {
            if (!marketId) return;
            const roomName = `market_${marketId}`;
            socket.join(roomName);
            logger.info(`Client ${socket.id} joined ${roomName}`);
            socket.emit('joined', { room: roomName });
        });

        socket.on('leaveMarket', (marketId) => {
            if (!marketId) return;
            const roomName = `market_${marketId}`;
            socket.leave(roomName);
            logger.info(`Client ${socket.id} left ${roomName}`);
        });

        socket.on('disconnect', () => {
            logger.info(`Client disconnected: ${socket.id}`);
        });
    });

    // Start listening to PostgreSQL NOTIFY
    listenToPostgresNotify();

    return io;
}

/**
 * Connects to Postgres using a dedicated client to LISTEN for 'odds_updates' notifications.
 */
async function listenToPostgresNotify() {
    let client;
    try {
        client = await db.connect();
        
        client.on('notification', (msg) => {
            if (msg.channel === 'odds_updates') {
                try {
                    const payload = JSON.parse(msg.payload);
                    const marketId = payload.marketId;
                    
                    // Broadcast to specific market room
                    if (marketId && io) {
                        const roomName = `market_${marketId}`;
                        io.to(roomName).emit('oddsUpdate', payload);
                        logger.info(`Broadcasted oddsUpdate to ${roomName}:`, payload);
                    }
                } catch (err) {
                    logger.error(`Failed to parse NOTIFY payload: ${err.message}`);
                }
            }
        });

        await client.query('LISTEN odds_updates');
        logger.info('Listening for PostgreSQL "odds_updates" NOTIFY events.');

        // Reconnect logic on error
        client.on('error', async (err) => {
            logger.error(`Postgres connection error in LISTEN client: ${err.message}`);
            client.release(err);
            setTimeout(listenToPostgresNotify, 5000); // Retry after 5 seconds
        });

    } catch (e) {
        logger.error(`Failed to start PostgreSQL LISTEN: ${e.message}`);
        setTimeout(listenToPostgresNotify, 5000); // Retry after 5 seconds
    }
}

function getIo() {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
}

module.exports = {
    initWebSocket,
    getIo
};
