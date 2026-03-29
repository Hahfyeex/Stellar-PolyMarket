jest.mock("../../db");
jest.mock("../../utils/redis", () => ({ get: jest.fn(), set: jest.fn(), del: jest.fn() }));
jest.mock("../../utils/logger", () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock("../../bots/eventBus", () => ({ emit: jest.fn() }));

const express = require("express");
const request = require("supertest");
const db = require("../../db");
const redis = require("../../utils/redis");
const betsRouter = require("../bets");

const app = express();
app.use(express.json());
app.use("/api/bets", betsRouter);

describe("POST /api/bets/payout/:marketId concurrency safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.del.mockResolvedValue(1);
  });

  test("concurrent payout requests pay each winner exactly once", async () => {
    const state = {
      market: {
        id: 1,
        resolved: true,
        winning_outcome: 0,
        total_pool: "100",
      },
      bets: [
        { id: 101, market_id: 1, outcome_index: 0, wallet_address: "WALLET_A", amount: "30", paid_out: false },
        { id: 102, market_id: 1, outcome_index: 0, wallet_address: "WALLET_B", amount: "70", paid_out: false },
      ],
    };

    let nextClientId = 1;
    let lockOwner = null;
    let waiters = [];

    const acquireLock = async (clientId) => {
      if (lockOwner === null || lockOwner === clientId) {
        lockOwner = clientId;
        return;
      }
      await new Promise((resolve) => waiters.push(resolve));
      lockOwner = clientId;
    };

    const releaseLock = (clientId) => {
      if (lockOwner !== clientId) return;
      lockOwner = null;
      const next = waiters.shift();
      if (next) next();
    };

    db.connect.mockImplementation(async () => {
      const clientId = nextClientId++;
      return {
        query: jest.fn(async (sql, params = []) => {
          if (sql === "BEGIN" || sql === "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE") {
            return { rows: [] };
          }

          if (sql === "COMMIT" || sql === "ROLLBACK") {
            releaseLock(clientId);
            return { rows: [] };
          }

          if (sql.includes("FROM markets") && sql.includes("FOR UPDATE")) {
            if (!state.market.resolved) return { rows: [] };
            return { rows: [{ ...state.market }] };
          }

          if (sql.includes("FROM bets") && sql.includes("FOR UPDATE")) {
            await acquireLock(clientId);
            const marketId = Number(params[0]);
            const outcomeIndex = Number(params[1]);
            const rows = state.bets
              .filter((b) => b.market_id === marketId && b.outcome_index === outcomeIndex)
              .map((b) => ({ ...b }));
            return { rows };
          }

          if (sql.startsWith("UPDATE bets SET paid_out = TRUE")) {
            const ids = params[0].map(Number);
            const updated = [];
            for (const bet of state.bets) {
              if (ids.includes(bet.id) && bet.paid_out === false) {
                bet.paid_out = true;
                updated.push({ id: bet.id, wallet_address: bet.wallet_address });
              }
            }
            return { rows: updated };
          }

          throw new Error(`Unexpected query in test: ${sql}`);
        }),
        release: jest.fn(),
      };
    });

    const [r1, r2] = await Promise.all([
      request(app).post("/api/bets/payout/1").send(),
      request(app).post("/api/bets/payout/1").send(),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 400]);

    const successResponse = r1.status === 200 ? r1 : r2;
    expect(successResponse.body.payouts).toHaveLength(2);
    expect(successResponse.body.payouts.map((p) => p.wallet).sort()).toEqual(["WALLET_A", "WALLET_B"]);

    const paidCount = state.bets.filter((b) => b.paid_out).length;
    expect(paidCount).toBe(2);
  });
});
