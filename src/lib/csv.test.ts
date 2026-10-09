import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes separators, quotes and line breaks", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("plain")).toBe("plain");
  });

  it("defuses spreadsheet formulas in text but not numbers", () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(csvCell("+48 600 000 000")).toBe("'+48 600 000 000");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell(-1.5)).toBe("-1.5");
  });

  it("adds a BOM and CRLFs", () => {
    expect(toCsv([["a", 1], ["b", 2]])).toBe("﻿a,1\r\nb,2\r\n");
  });
});
