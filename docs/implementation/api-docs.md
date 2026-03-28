# API Documentation

This directory contains the API documentation for the Stellar PolyMarket backend.

## System Health & Network Latency Monitor

### `GET /api/status`
Reports the health of the Application layer, the Database (Postgres), and the Stellar Horizon/RPC nodes.

**Response Schema:**
```json
{
  "status": "up" | "degraded" | "down",
  "uptime": 12345,
  "services": {
    "database": {
      "status": "up" | "down",
      "latency": 45,
      "error": "string (optional)"
    },
    "stellar": {
      "status": "up" | "down",
      "latency": 120,
      "error": "string (optional)"
    }
  },
  "timestamp": "ISO 8601 String"
}
```

- **`status`**: Overall system status. `up` if all services are reachable, `degraded` if one is unreachable, `down` if both are unreachable.
- **`uptime`**: Backend process uptime in seconds.
- **`services.database`**: Contains latency in milliseconds if `status` is `up`. Contains `error` if `status` is `down`.
- **`services.stellar`**: Contains latency in milliseconds if `status` is `up`. Contains `error` if `status` is `down`.

**Status Codes:**
- `200 OK`: When system is `up` or `degraded`.
- `503 Service Unavailable`: When system is completely `down` (both core services unreachable).
