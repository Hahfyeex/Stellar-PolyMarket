# WebSocket API Documentation

This document describes the real-time WebSocket events available for pushing live data updates to connected clients without needing page refreshes.

## Connection
Clients should connect via Socket.io targeting the root URL.

Example (Client-side):
```javascript
import { io } from "socket.io-client";
const socket = io("http://localhost:4000"); // Backend URL
```

## Supported Events

### `joinMarket` (Client → Server)
Emitted by the client to join a specific market's room to receive odds updates.

**Payload:**
`marketId` (Number | String): The unique identifier of the market.

**Example usage:**
```javascript
socket.emit('joinMarket', 123);
```

### `joined` (Server → Client)
Acknowledgement from the server confirming the client successfully joined the room.

**Payload:**
```json
{
  "room": "market_123"
}
```

### `leaveMarket` (Client → Server)
Emitted by the client to stop receiving events for a specific market.

**Payload:**
`marketId` (Number | String)

### `oddsUpdate` (Server → Client)
Pushed from the server to all clients in `market_{marketId}` whenever an external Postgres `NOTIFY` is triggered (e.g., when a new bet is indexed).

**Payload structure (JSON):**
```json
{
  "marketId": 123,
  "options": [
    { "outcome": 0, "name": "Yes", "odds": 0.65 },
    { "outcome": 1, "name": "No", "odds": 0.35 }
  ],
  "totalPool": 5000000,
  "timestamp": "2026-03-25T12:00:00.000Z"
}
```

**Example usage:**
```javascript
socket.on('oddsUpdate', (data) => {
    console.log(`Live odds updated for market ${data.marketId}:`, data.options);
});
```
