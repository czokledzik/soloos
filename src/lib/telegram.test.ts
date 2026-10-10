import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTelegramExport, textOf } from "./telegram";

const full = readFileSync("test/fixtures/telegram-full.json", "utf8");

describe("parseTelegramExport", () => {
  it("reads a full account export", () => {
    const res = parseTelegramExport(full);
    expect(res.meId).toBe("user1001");
    expect(res.errors).toEqual([]);
    expect(res.chats.map((c) => [c.id, c.name, c.messages.length])).toEqual([
      [2002, "Anna Nowak", 4],
      [3003, "Shop project", 3],
    ]);
    const anna = res.chats[0];
    expect(anna.messages.map((m) => [m.fromId, m.body])).toEqual([
      ["user2002", "Cześć! Brief w załączniku"],
      ["user2002", "[file: brief.pdf]"],
      ["user1001", "Dzięki, zobacz [ofertę](https://offers.example/o/abc) i daj znać"],
      ["user1001", "mockup\n[photo]"],
    ]);
    expect(anna.messages[0].sentAt).toEqual(new Date(1791203520 * 1000));
    expect(anna.participants).toEqual([
      { handle: "user2002", name: "Anna Nowak", count: 2 },
      { handle: "user1001", name: "Tomasz Lis", count: 2 },
    ]);
    expect(res.chats[1].messages[2].body).toBe("[sticker 👍]");
  });

  it("reads a single-chat export", () => {
    const chat = JSON.parse(full).chats.list[0];
    const res = parseTelegramExport(JSON.stringify(chat));
    expect(res.chats).toHaveLength(1);
    expect(res.meId).toBeNull();
  });

  it("guesses me as the only person in every chat when personal info is missing", () => {
    const data = JSON.parse(full);
    delete data.personal_information;
    // Anna is in both chats too, so it's ambiguous…
    expect(parseTelegramExport(JSON.stringify(data)).meId).toBeNull();
    // …until she isn't.
    data.chats.list[1].messages.pop();
    expect(parseTelegramExport(JSON.stringify(data)).meId).toBe("user1001");
  });

  it("explains files it can't read", () => {
    expect(parseTelegramExport("<html>").errors[0]).toMatch(/Not a JSON file/);
    expect(parseTelegramExport("{}").errors[0]).toMatch(/No chats found/);
  });
});

describe("textOf", () => {
  it("joins rich text parts", () => {
    expect(textOf(["a ", { type: "bold", text: "b" }, { type: "link", text: "https://x.pl" }])).toBe("a bhttps://x.pl");
    expect(textOf(undefined)).toBe("");
  });
});
