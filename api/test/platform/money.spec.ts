import { describe, expect, it } from "vitest";
import { allocate, applyRate, extend, fromMinor, fromQty, toMinor, toQty } from "../../src/platform/data/money.js";

describe("money", () => {
  it("parses decimal strings exactly", () => {
    expect(toMinor("0.1", "LKR") + toMinor("0.2", "LKR")).toBe(toMinor("0.3", "LKR"));
    expect(toMinor("1234.56", "USD")).toBe(123456);
    expect(toMinor("-10.005", "LKR")).toBe(-1001);
    expect(toMinor("1.2345", "KWD")).toBe(1235);
    expect(toMinor("500", "JPY")).toBe(500);
    expect(toMinor(19.99, "USD")).toBe(1999);
  });

  it("formats minor units", () => {
    expect(fromMinor(123456, "LKR")).toBe("1234.56");
    expect(fromMinor(-5, "LKR")).toBe("-0.05");
    expect(fromMinor(1235, "KWD")).toBe("1.235");
    expect(fromMinor(500, "JPY")).toBe("500");
  });

  it("rejects malformed input", () => {
    expect(() => toMinor("12,50", "LKR")).toThrow(RangeError);
    expect(() => toMinor("1e3", "LKR")).toThrow(RangeError);
  });

  it("extends quantity by price with rounding", () => {
    expect(extend(toQty("2.5"), toMinor("3.33", "LKR"))).toBe(833); // 8.325 -> 8.33
    expect(fromQty(toQty("1.0005"))).toBe("1.001");
  });

  it("applies rates held as scaled integers", () => {
    expect(applyRate(10000, 1800)).toBe(1800); // 18% of 100.00
    expect(applyRate(999, 1250)).toBe(125); // 12.5% of 9.99 = 1.24875
  });

  it("allocates without losing cents", () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
    expect(allocate(-100, [3, 1])).toEqual([-75, -25]);
  });
});
