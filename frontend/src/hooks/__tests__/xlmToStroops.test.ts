/**
 * Tests for XLM to stroop conversion logic used in bet submission.
 * 1 XLM = 10_000_000 stroops
 */

const XLM_TO_STROOPS = 10_000_000;

function xlmToStroops(xlm: string): { stroops: string | null; error: string | null } {
  const parsed = parseFloat(xlm);
  if (!isFinite(parsed) || parsed <= 0) {
    return { stroops: null, error: "Enter a valid positive amount" };
  }
  return { stroops: String(Math.round(parsed * XLM_TO_STROOPS)), error: null };
}

describe("xlmToStroops conversion", () => {
  it.each([
    ["1", "10000000"],
    ["0.5", "5000000"],
    ["10.5", "105000000"],
    ["0.0000001", "1"],
    ["100", "1000000000"],
  ])("converts %s XLM to %s stroops", (xlm, expected) => {
    const { stroops, error } = xlmToStroops(xlm);
    expect(error).toBeNull();
    expect(stroops).toBe(expected);
  });

  it.each(["0", "-1", "abc", "", "NaN"])("rejects invalid input %s", (input) => {
    const { stroops, error } = xlmToStroops(input);
    expect(stroops).toBeNull();
    expect(error).toBeTruthy();
  });

  it("produces an integer string (no decimal point)", () => {
    const { stroops } = xlmToStroops("1.23456789");
    expect(stroops).not.toContain(".");
  });
});
