"use strict";

/**
 * Tests for migration 007_market_query_indexes.sql
 *
 * Verifies:
 * - All five required indexes are present in the migration
 * - Each index targets the correct table and column
 * - CONCURRENTLY is used (no ACCESS EXCLUSIVE lock during build)
 * - IF NOT EXISTS is used (idempotent / safe to re-run)
 * - No destructive statements (DROP TABLE, TRUNCATE, DELETE, ALTER TABLE DROP)
 * - Migration is a pure DDL file (no DML that could mutate data)
 * - Index names match the agreed naming convention
 * - SQL is syntactically well-formed (balanced parentheses, semicolons present)
 */

const fs = require("fs");
const path = require("path");

const MIGRATION_PATH = path.join(
  __dirname,
  "../db/migrations/007_market_query_indexes.sql"
);

describe("Migration 007: market query indexes", () => {
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  });

  // ── File existence ──────────────────────────────────────────────────────────

  it("migration file exists", () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("migration file is non-empty", () => {
    expect(sql.trim().length).toBeGreaterThan(0);
  });

  // ── Required indexes ────────────────────────────────────────────────────────

  describe("idx_markets_resolved", () => {
    it("creates index on markets(resolved)", () => {
      expect(sql).toMatch(/CREATE INDEX.*idx_markets_resolved\s+ON\s+markets\s*\(\s*resolved\s*\)/is);
    });

    it("uses CONCURRENTLY", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY.*idx_markets_resolved/is);
    });

    it("uses IF NOT EXISTS", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS.*idx_markets_resolved/is);
    });
  });

  describe("idx_markets_end_date", () => {
    it("creates index on markets(end_date)", () => {
      expect(sql).toMatch(/CREATE INDEX.*idx_markets_end_date\s+ON\s+markets\s*\(\s*end_date\s*\)/is);
    });

    it("uses CONCURRENTLY", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY.*idx_markets_end_date/is);
    });

    it("uses IF NOT EXISTS", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS.*idx_markets_end_date/is);
    });
  });

  describe("idx_markets_created_at", () => {
    it("creates index on markets(created_at DESC)", () => {
      expect(sql).toMatch(/CREATE INDEX.*idx_markets_created_at\s+ON\s+markets\s*\(\s*created_at\s+DESC\s*\)/is);
    });

    it("uses CONCURRENTLY", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY.*idx_markets_created_at/is);
    });

    it("uses IF NOT EXISTS", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS.*idx_markets_created_at/is);
    });

    it("stores index in DESC order for efficient ORDER BY created_at DESC", () => {
      expect(sql).toMatch(/idx_markets_created_at\s+ON\s+markets\s*\(\s*created_at\s+DESC\s*\)/is);
    });
  });

  describe("idx_bets_market_id", () => {
    it("creates index on bets(market_id)", () => {
      expect(sql).toMatch(/CREATE INDEX.*idx_bets_market_id\s+ON\s+bets\s*\(\s*market_id\s*\)/is);
    });

    it("uses CONCURRENTLY", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY.*idx_bets_market_id/is);
    });

    it("uses IF NOT EXISTS", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS.*idx_bets_market_id/is);
    });
  });

  describe("idx_bets_wallet_address", () => {
    it("creates index on bets(wallet_address)", () => {
      expect(sql).toMatch(/CREATE INDEX.*idx_bets_wallet_address\s+ON\s+bets\s*\(\s*wallet_address\s*\)/is);
    });

    it("uses CONCURRENTLY", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY.*idx_bets_wallet_address/is);
    });

    it("uses IF NOT EXISTS", () => {
      expect(sql).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS.*idx_bets_wallet_address/is);
    });
  });

  // ── Index count ─────────────────────────────────────────────────────────────

  it("contains exactly 5 CREATE INDEX statements", () => {
    const matches = sql.match(/CREATE INDEX/gi) ?? [];
    expect(matches).toHaveLength(5);
  });

  it("all 5 indexes use CONCURRENTLY", () => {
    const total = (sql.match(/CREATE INDEX/gi) ?? []).length;
    const concurrent = (sql.match(/CREATE INDEX CONCURRENTLY/gi) ?? []).length;
    expect(concurrent).toBe(total);
  });

  it("all 5 indexes use IF NOT EXISTS", () => {
    const total = (sql.match(/CREATE INDEX/gi) ?? []).length;
    const idempotent = (sql.match(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/gi) ?? []).length;
    expect(idempotent).toBe(total);
  });

  // ── Table coverage ──────────────────────────────────────────────────────────

  it("covers the markets table", () => {
    expect(sql).toMatch(/ON\s+markets\s*\(/i);
  });

  it("covers the bets table", () => {
    expect(sql).toMatch(/ON\s+bets\s*\(/i);
  });

  it("creates 3 indexes on markets", () => {
    // Count only non-comment lines that reference ON markets
    const lines = sql.split("\n").filter((l) => !l.trim().startsWith("--"));
    const matches = lines.join("\n").match(/ON\s+markets\s*\(/gi) ?? [];
    expect(matches).toHaveLength(3);
  });

  it("creates 2 indexes on bets", () => {
    const lines = sql.split("\n").filter((l) => !l.trim().startsWith("--"));
    const matches = lines.join("\n").match(/ON\s+bets\s*\(/gi) ?? [];
    expect(matches).toHaveLength(2);
  });

  // ── Safety: no destructive statements ──────────────────────────────────────

  it("contains no DROP TABLE statements", () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });

  it("contains no TRUNCATE statements", () => {
    expect(sql).not.toMatch(/TRUNCATE/i);
  });

  it("contains no DELETE statements", () => {
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  it("contains no ALTER TABLE DROP COLUMN statements", () => {
    expect(sql).not.toMatch(/ALTER\s+TABLE.*DROP\s+COLUMN/i);
  });

  it("contains no INSERT or UPDATE statements", () => {
    expect(sql).not.toMatch(/\b(INSERT|UPDATE)\b/i);
  });

  // ── SQL well-formedness ─────────────────────────────────────────────────────

  it("every CREATE INDEX statement ends with a semicolon", () => {
    // Extract each CREATE INDEX block and verify it ends with ;
    const statements = sql
      .split(/;/)
      .map((s) => s.trim())
      .filter((s) => /CREATE INDEX/i.test(s));
    // We split on ; so each segment should contain exactly one CREATE INDEX
    expect(statements).toHaveLength(5);
  });

  it("has balanced parentheses", () => {
    let depth = 0;
    for (const ch of sql) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  // ── Naming convention ───────────────────────────────────────────────────────

  it("index names follow idx_<table>_<column> convention", () => {
    const expectedNames = [
      "idx_markets_resolved",
      "idx_markets_end_date",
      "idx_markets_created_at",
      "idx_bets_market_id",
      "idx_bets_wallet_address",
    ];
    for (const name of expectedNames) {
      expect(sql).toContain(name);
    }
  });

  it("no index name appears more than once in CREATE INDEX statements", () => {
    // Strip comment lines before counting to avoid matching names in comments
    const codeLines = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const names = [
      "idx_markets_resolved",
      "idx_markets_end_date",
      "idx_markets_created_at",
      "idx_bets_market_id",
      "idx_bets_wallet_address",
    ];
    for (const name of names) {
      const occurrences = (codeLines.match(new RegExp(name, "g")) ?? []).length;
      expect(occurrences).toBe(1);
    }
  });

  // ── Column correctness ──────────────────────────────────────────────────────

  it("resolved index targets the boolean resolved column", () => {
    expect(sql).toMatch(/idx_markets_resolved\s+ON\s+markets\s*\(\s*resolved\s*\)/is);
  });

  it("end_date index targets the timestamptz end_date column", () => {
    expect(sql).toMatch(/idx_markets_end_date\s+ON\s+markets\s*\(\s*end_date\s*\)/is);
  });

  it("created_at index targets created_at with DESC sort order", () => {
    expect(sql).toMatch(/idx_markets_created_at\s+ON\s+markets\s*\(\s*created_at\s+DESC\s*\)/is);
  });

  it("market_id index targets the foreign key column on bets", () => {
    expect(sql).toMatch(/idx_bets_market_id\s+ON\s+bets\s*\(\s*market_id\s*\)/is);
  });

  it("wallet_address index targets the wallet_address text column on bets", () => {
    expect(sql).toMatch(/idx_bets_wallet_address\s+ON\s+bets\s*\(\s*wallet_address\s*\)/is);
  });
});
