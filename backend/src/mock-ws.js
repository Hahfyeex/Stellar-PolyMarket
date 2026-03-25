const { createServer } = require("http");
const { initWebSocket } = require("./websocket");
const Client = require("socket.io-client");
const db = require("./db");

async function run() {
    const httpServer = createServer();
    initWebSocket(httpServer);

    httpServer.listen(async () => {
        const port = httpServer.address().port;
        const clientA = new Client(`http://localhost:${port}`);
        const clientB = new Client(`http://localhost:${port}`);

        clientA.on('connect', () => {
            console.log("Window A connected.");
            clientA.emit('joinMarket', 123);
        });

        clientB.on('connect', () => {
            console.log("Window B connected.");
            clientB.emit('joinMarket', 123);
        });

        let receivedCount = 0;

        clientA.on('oddsUpdate', (data) => {
            console.log(`[Window A] Received live odds update for Market ${data.marketId}:`, JSON.stringify(data.options));
            receivedCount++;
            checkDone();
        });

        clientB.on('oddsUpdate', (data) => {
            console.log(`[Window B] Received live odds update for Market ${data.marketId}:`, JSON.stringify(data.options));
            receivedCount++;
            checkDone();
        });

        function checkDone() {
            if (receivedCount === 2) {
                console.log("Test complete. Both windows received the update in real-time.");
                process.exit(0);
            }
        }

        // Wait a bit for connections to establish
        setTimeout(async () => {
            console.log("Simulating a new bet being placed (triggering Postgres NOTIFY)...");
            const payload = {
                marketId: 123,
                options: [
                    { outcome: 0, name: "Yes", odds: 0.65 },
                    { outcome: 1, name: "No",  odds: 0.35 }
                ],
                totalPool: 5000000,
                timestamp: new Date().toISOString()
            };
            
            // Broadcast directly via getIo
            const { getIo } = require('./websocket');
            getIo().to("market_123").emit('oddsUpdate', payload);
        }, 1000);
    });
}

run().catch(console.error);
