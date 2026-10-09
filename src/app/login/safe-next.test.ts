import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps local paths", () => {
    expect(safeNext("/projects/3?tab=time")).toBe("/projects/3?tab=time");
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "/\\/evil.com", "\\\\evil.com", "/\t/evil.com", "", null, 3])(
    "rejects %j",
    (input) => {
      expect(safeNext(input)).toBe("/");
    },
  );
});
