import { describe, expect, it } from "vitest";
import { formatElapsed, formatMinutes, formatMoney, moneyInput, parseCurrency, parseDuration, parseMoney } from "./format";

describe("parseDuration", () => {
  it.each([
    ["1:30", 90],
    ["0:05", 5],
    ["1.5", 90],
    ["1,5", 90],
    ["2", 120],
    ["90m", 90],
    ["1h", 60],
    ["1h 30m", 90],
    ["1.5h", 90],
    ["  45m ", 45],
  ])("%s → %i min", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it("returns null for empty or unreadable input", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });
});

describe("parseMoney", () => {
  it.each([
    ["123.45", 12345],
    ["123,45", 12345],
    ["1 234,50", 123450],
    ["150", 15000],
    ["0", 0],
  ])("%s → %i", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it("returns null for empty or unreadable input", () => {
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney("  ")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("round-trips through moneyInput", () => {
    expect(parseMoney(moneyInput(123450))).toBe(123450);
    expect(moneyInput(null)).toBe("");
  });
});

describe("formatting", () => {
  it("formats minutes as h:mm", () => {
    expect(formatMinutes(0)).toBe("0:00");
    expect(formatMinutes(1234)).toBe("20:34");
    expect(formatMinutes(-90)).toBe("-1:30");
  });

  it("formats elapsed seconds", () => {
    expect(formatElapsed(3723)).toBe("1:02:03");
    expect(formatElapsed(-5)).toBe("0:00:00");
  });

  it("formats money in Polish style", () => {
    expect(formatMoney(null)).toBe("—");
    // Polish groups thousands only from five digits up.
    expect(formatMoney(123450).replace(/\s/g, " ")).toBe("1234,50 zł");
    expect(formatMoney(1234550).replace(/\s/g, " ")).toBe("12 345,50 zł");
  });
});

describe("currencies", () => {
  it("formats unknown currency codes without crashing", () => {
    expect(formatMoney(150_00, "ZL").replace(/\s/g, " ")).toBe("150,00 ZL");
  });

  it("normalizes currency input", () => {
    expect(parseCurrency(" eur ")).toBe("EUR");
    expect(parseCurrency("zł")).toBeNull();
    expect(parseCurrency("")).toBeNull();
  });
});
