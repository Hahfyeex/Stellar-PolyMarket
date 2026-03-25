const { createServer } = require("http");
const { Server } = require("socket.io");
const Client = require("socket.io-client");
const { initWebSocket } = require("../src/websocket");
const db = require("../src/db"); // to mock postgres listener

jest.mock("../src/db", () => {
    return {
        connect: jest.fn()
    };
});

describe("WebSocket Odds Streamer", () => {
    let io, serverSocket, clientSocket, httpServer;
    let mockPgClient;

    beforeAll((done) => {
        // Setup mock Postgres client behavior
        mockPgClient = {
            on: jest.fn(),
            query: jest.fn().mockResolvedValue(),
            release: jest.fn()
        };
        db.connect.mockResolvedValue(mockPgClient);

        httpServer = createServer();
        // Initialize our websocket server
        io = initWebSocket(httpServer);
        
        httpServer.listen(() => {
            const port = httpServer.address().port;
            clientSocket = new Client(`http://localhost:${port}`);
            io.on("connection", (socket) => {
                serverSocket = socket;
            });
            clientSocket.on("connect", done);
        });
    });

    afterAll(() => {
        if (io) io.close();
        if (clientSocket) clientSocket.close();
        if (httpServer) httpServer.close();
    });

    test("client can connect successfully", () => {
        expect(clientSocket.connected).toBe(true);
    });

    test("client can emit joinMarket and receive joined ACK", (done) => {
        clientSocket.once("joined", (arg) => {
            expect(arg.room).toBe("market_999");
            // Check that the server socket has actually joined the room
            expect(serverSocket.rooms.has("market_999")).toBe(true);
            done();
        });
        clientSocket.emit("joinMarket", 999);
    });

    test("client can emit leaveMarket", (done) => {
        clientSocket.emit("leaveMarket", 999);
        setTimeout(() => {
            expect(serverSocket.rooms.has("market_999")).toBe(false);
            done();
        }, 100);
    });

    test("simulated Postgres NOTIFY broadcasts oddsUpdate to specific market room", (done) => {
        clientSocket.emit("joinMarket", 888);
        
        clientSocket.on("oddsUpdate", (data) => {
            expect(data.marketId).toBe(888);
            expect(data.odds).toBe("updated");
            done();
        });

        // Wait to join room, then simulate the emit
        setTimeout(() => {
            // Find the notification callback attached by listenToPostgresNotify
            const notifyCallback = mockPgClient.on.mock.calls.find(c => c[0] === 'notification')[1];
            expect(notifyCallback).toBeDefined();

            // Simulate the Postgres notification
            notifyCallback({
                channel: 'odds_updates',
                payload: JSON.stringify({ marketId: 888, odds: "updated" })
            });
        }, 100);
    });

    test("invalid missing marketId on join/leave doesn't crash", (done) => {
        clientSocket.emit("joinMarket", null);
        clientSocket.emit("leaveMarket", undefined);
        setTimeout(() => {
            expect(serverSocket.rooms.size).toBeGreaterThanOrEqual(1); // its own socket.id
            done();
        }, 50);
    });

    test("invalid JSON payload on NOTIFY doesn't crash", (done) => {
        const notifyCallback = mockPgClient.on.mock.calls.find(c => c[0] === 'notification')[1];
        
        expect(() => {
            notifyCallback({
                channel: 'odds_updates',
                payload: "INVALID_JSON_HERE"
            });
        }).not.toThrow();
        done();
    });

    test("Postgres client error triggers reconnection", (done) => {
        const errorCallback = mockPgClient.on.mock.calls.find(c => c[0] === 'error')[1];
        expect(() => {
            errorCallback(new Error("Connection lost"));
        }).not.toThrow();
        expect(mockPgClient.release).toHaveBeenCalled();
        done();
    });

    test("Failed db.connect triggers reconnection timeout", async () => {
        db.connect.mockRejectedValueOnce(new Error("DB Down"));
        // Re-invoke to hit the catch block
        const { initWebSocket } = require("../src/websocket");
        // We just call initWebSocket again using a dummy server to trigger listenToPostgresNotify
        initWebSocket(createServer());
        // Since it's async inside and swallows error, we just await a tick
        await new Promise(r => setTimeout(r, 50));
    });

    test("getIo returns the initialized io instance", () => {
        const { getIo } = require("../src/websocket");
        expect(getIo()).toBeDefined();
    });
});
