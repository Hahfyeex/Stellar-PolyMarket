import { getBadgeTier, BADGE_TIERS, BADGE_GLOW_COLORS } from "../badgeTier";

// ── getBadgeTier — happy paths ────────────────────────────────────────────────

describe("getBadgeTier — tier award", () => {
  // Diamond: 200+ markets, 75%+ accuracy
  it("awards diamond when marketsCount=200 and accuracyPct=75 (exact threshold)", () => {
    expect(getBadgeTier(200, 75)).toBe("diamond");
  });

  it("awards diamond when marketsCount=250 and accuracyPct=80 (well above threshold)", () => {
    expect(getBadgeTier(250, 80)).toBe("diamond");
  });

  // Gold: 100+ markets, 65%+ accuracy (but below diamond conditions)
  it("awards gold when marketsCount=100 and accuracyPct=65 (exact threshold)", () => {
    expect(getBadgeTier(100, 65)).toBe("gold");
  });

  it("awards gold when marketsCount=150 and accuracyPct=70 (above gold, below diamond accuracy)", () => {
    expect(getBadgeTier(150, 70)).toBe("gold");
  });

  it("awards gold when marketsCount=199 and accuracyPct=74 (just below diamond threshold)", () => {
    expect(getBadgeTier(199, 74)).toBe("gold");
  });

  // Silver: 50+ markets, 55%+ accuracy (but below gold conditions)
  it("awards silver when marketsCount=50 and accuracyPct=55 (exact threshold)", () => {
    expect(getBadgeTier(50, 55)).toBe("silver");
  });

  it("awards silver when marketsCount=80 and accuracyPct=60 (above silver, below gold accuracy)", () => {
    expect(getBadgeTier(80, 60)).toBe("silver");
  });

  it("awards silver when marketsCount=99 and accuracyPct=64 (just below gold threshold)", () => {
    expect(getBadgeTier(99, 64)).toBe("silver");
  });

  // Bronze: 10+ markets, no accuracy requirement
  it("awards bronze when marketsCount=10 and accuracyPct=0 (exact threshold, no accuracy gate)", () => {
    expect(getBadgeTier(10, 0)).toBe("bronze");
  });

  it("awards bronze when marketsCount=49 and accuracyPct=0 (just below silver market count)", () => {
    expect(getBadgeTier(49, 0)).toBe("bronze");
  });

  it("awards bronze when marketsCount=20 and accuracyPct=90 (high accuracy but low markets)", () => {
    // Even with perfect accuracy, only 20 markets → bronze (not silver's 50 minimum)
    expect(getBadgeTier(20, 90)).toBe("bronze");
  });
});

// ── getBadgeTier — null (no badge) ────────────────────────────────────────────

describe("getBadgeTier — no badge awarded", () => {
  it("returns null when marketsCount=0 (zero markets)", () => {
    expect(getBadgeTier(0, 0)).toBeNull();
  });

  it("returns null when marketsCount=0 and accuracyPct=100 (perfect accuracy but no markets)", () => {
    expect(getBadgeTier(0, 100)).toBeNull();
  });

  it("returns null when marketsCount=9 (one below bronze threshold)", () => {
    expect(getBadgeTier(9, 0)).toBeNull();
  });

  it("returns null when marketsCount=9 and accuracyPct=100 (one below bronze regardless of accuracy)", () => {
    expect(getBadgeTier(9, 100)).toBeNull();
  });
});

// ── getBadgeTier — accuracy gates ─────────────────────────────────────────────

describe("getBadgeTier — accuracy gates prevent tier upgrade", () => {
  it("awards bronze (not silver) when marketsCount=50 but accuracyPct=54 (1% below silver gate)", () => {
    expect(getBadgeTier(50, 54)).toBe("bronze");
  });

  it("awards silver (not gold) when marketsCount=100 but accuracyPct=64 (1% below gold gate)", () => {
    expect(getBadgeTier(100, 64)).toBe("silver");
  });

  it("awards gold (not diamond) when marketsCount=200 but accuracyPct=74 (1% below diamond gate)", () => {
    expect(getBadgeTier(200, 74)).toBe("gold");
  });

  it("awards bronze (not silver) when marketsCount=200 but accuracyPct=0 (meets market count only)", () => {
    // 200 markets but 0% accuracy → still bronze (no accuracy gate), since silver requires 55%
    expect(getBadgeTier(200, 0)).toBe("bronze");
  });
});

// ── getBadgeTier — market count gates ────────────────────────────────────────

describe("getBadgeTier — market count gates prevent tier upgrade", () => {
  it("awards bronze (not silver) when marketsCount=49 and accuracyPct=90 (1 below silver market threshold)", () => {
    expect(getBadgeTier(49, 90)).toBe("bronze");
  });

  it("awards silver (not gold) when marketsCount=99 and accuracyPct=90 (1 below gold market threshold)", () => {
    expect(getBadgeTier(99, 90)).toBe("silver");
  });

  it("awards gold (not diamond) when marketsCount=199 and accuracyPct=90 (1 below diamond market threshold)", () => {
    expect(getBadgeTier(199, 90)).toBe("gold");
  });
});

// ── getBadgeTier — accuracy tie-breaking ──────────────────────────────────────

describe("getBadgeTier — accuracy ties (exactly at threshold)", () => {
  it("awards silver at exactly 55% accuracy with 50+ markets", () => {
    expect(getBadgeTier(50, 55)).toBe("silver");
  });

  it("awards gold at exactly 65% accuracy with 100+ markets", () => {
    expect(getBadgeTier(100, 65)).toBe("gold");
  });

  it("awards diamond at exactly 75% accuracy with 200+ markets", () => {
    expect(getBadgeTier(200, 75)).toBe("diamond");
  });

  it("does NOT award silver at 54.9% (just below threshold) with 50+ markets", () => {
    // 54.9 rounds away from 55, so should be bronze
    expect(getBadgeTier(50, 54.9)).toBe("bronze");
  });
});

// ── BADGE_TIERS constant — structure validation ───────────────────────────────

describe("BADGE_TIERS constant", () => {
  it("contains exactly 4 tiers", () => {
    expect(BADGE_TIERS).toHaveLength(4);
  });

  it("has tiers sorted from highest to lowest (diamond first, bronze last)", () => {
    const tierNames = BADGE_TIERS.map((t) => t.tier);
    expect(tierNames).toEqual(["diamond", "gold", "silver", "bronze"]);
  });

  it("has minMarkets sorted descending across tiers", () => {
    for (let i = 0; i < BADGE_TIERS.length - 1; i++) {
      expect(BADGE_TIERS[i].minMarkets).toBeGreaterThan(BADGE_TIERS[i + 1].minMarkets);
    }
  });

  it("bronze tier has minAccuracy of 0 (no accuracy gate)", () => {
    const bronze = BADGE_TIERS.find((t) => t.tier === "bronze");
    expect(bronze?.minAccuracy).toBe(0);
  });
});

// ── BADGE_GLOW_COLORS constant ────────────────────────────────────────────────

describe("BADGE_GLOW_COLORS constant", () => {
  it("has a glow color defined for all 4 tiers", () => {
    expect(BADGE_GLOW_COLORS.bronze).toBeDefined();
    expect(BADGE_GLOW_COLORS.silver).toBeDefined();
    expect(BADGE_GLOW_COLORS.gold).toBeDefined();
    expect(BADGE_GLOW_COLORS.diamond).toBeDefined();
  });

  it("each glow color is a valid hex string", () => {
    const hexRegex = /^#[0-9a-fA-F]{3,8}$/;
    for (const color of Object.values(BADGE_GLOW_COLORS)) {
      expect(color).toMatch(hexRegex);
    }
  });
});
