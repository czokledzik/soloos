import { describe, expect, it } from "vitest";
import { linkify } from "./linkify";

describe("linkify", () => {
  it("turns markdown links and bare URLs into links", () => {
    expect(linkify("zobacz [ofertę](https://offers.example/o/abc) albo https://x.example/a?b=1.")).toEqual([
      { text: "zobacz " },
      { text: "ofertę", href: "https://offers.example/o/abc" },
      { text: " albo " },
      { text: "https://x.example/a?b=1", href: "https://x.example/a?b=1" },
      { text: "." },
    ]);
  });

  it("leaves other schemes as text", () => {
    expect(linkify("[click](javascript:alert(1))")).toEqual([{ text: "[click](javascript:alert(1))" }]);
  });

  it("keeps plain text whole", () => {
    expect(linkify("no links here")).toEqual([{ text: "no links here" }]);
    expect(linkify("")).toEqual([]);
  });
});
