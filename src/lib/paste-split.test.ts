import { describe, expect, it } from "vitest";
import { ME, splitConversation } from "./paste-split";

describe("splitConversation", () => {
  it("reads WhatsApp exports (day-first, multi-line messages)", () => {
    const text = [
      "05.10.2026, 14:32 - Anna Nowak: Cześć, masz chwilę?",
      "05.10.2026, 14:35 - Tomasz: Jasne",
      "05.10.2026, 14:36 - Anna Nowak: Super. Mam taki plan:",
      "1. sklep",
      "2. integracja z n8n",
    ].join("\n");
    const res = splitConversation(text);
    expect(res.format).toBe("whatsapp");
    expect(res.senders).toEqual(["Anna Nowak", "Tomasz"]);
    expect(res.messages).toEqual([
      { sender: "Anna Nowak", at: "2026-10-05T14:32", body: "Cześć, masz chwilę?" },
      { sender: "Tomasz", at: "2026-10-05T14:35", body: "Jasne" },
      { sender: "Anna Nowak", at: "2026-10-05T14:36", body: "Super. Mam taki plan:\n1. sklep\n2. integracja z n8n" },
    ]);
  });

  it("reads bracketed and US-style WhatsApp lines", () => {
    const bracketed = splitConversation("[05/10/2026, 09:01:22] Anna: hi\n[05/10/2026, 09:02:00] Me: hello");
    expect(bracketed.messages.map((m) => m.at)).toEqual(["2026-10-05T09:01", "2026-10-05T09:02"]);
    const us = splitConversation("10/25/26, 2:32 PM - Anna: hi\n10/25/26, 2:40 PM - Bob: yo");
    expect(us.messages.map((m) => m.at)).toEqual(["2026-10-25T14:32", "2026-10-25T14:40"]);
  });

  it("reads Telegram Desktop copies", () => {
    const text = [
      "Anna Nowak, [05.10.2026 14:32]",
      "Hej, wysyłam brief",
      "",
      "Tomasz Lis, [05.10.2026 14:40]",
      "Dzięki, odezwę się jutro",
    ].join("\n");
    const res = splitConversation(text);
    expect(res.format).toBe("telegram");
    expect(res.messages).toEqual([
      { sender: "Anna Nowak", at: "2026-10-05T14:32", body: "Hej, wysyłam brief" },
      { sender: "Tomasz Lis", at: "2026-10-05T14:40", body: "Dzięki, odezwę się jutro" },
    ]);
  });

  it("reads simple chat logs, with times on the fallback date", () => {
    const text = "[10:00] Anna: Is the API ready?\n[10:05] Me: Almost, tomorrow\n[10:06] Anna: 👍";
    const res = splitConversation(text, "2026-10-05");
    expect(res.format).toBe("chat");
    expect(res.messages.map((m) => [m.sender, m.at, m.body])).toEqual([
      ["Anna", "2026-10-05T10:00", "Is the API ready?"],
      ["Me", "2026-10-05T10:05", "Almost, tomorrow"],
      ["Anna", "2026-10-05T10:06", "👍"],
    ]);
  });

  it("reads Messenger copies where the sender line repeats", () => {
    const text = [
      "Anna Nowak",
      "Dzień dobry, widziałam Pana post",
      "Ile by kosztował sklep?",
      "You sent",
      "Dzień dobry! Zależy od zakresu",
      "Anna Nowak",
      "Ok, wyślę szczegóły",
    ].join("\n");
    const res = splitConversation(text);
    expect(res.format).toBe("messenger");
    expect(res.messages.map((m) => [m.sender, m.body])).toEqual([
      ["Anna Nowak", "Dzień dobry, widziałam Pana post\nIle by kosztował sklep?"],
      [ME, "Dzień dobry! Zależy od zakresu"],
      ["Anna Nowak", "Ok, wyślę szczegóły"],
    ]);
  });

  it("leaves prose and emails as one message", () => {
    const email = [
      "From: Anna <anna@example.com>",
      "Subject: Oferta",
      "",
      "Dzień dobry,",
      "w załączniku brief. Note: deadline is flexible.",
      "Pozdrawiam, Anna",
    ].join("\n");
    const res = splitConversation(email);
    expect(res.format).toBe("none");
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0].body).toBe(email);
  });

  it("handles empty input", () => {
    expect(splitConversation("  \n ")).toEqual({ messages: [], senders: [], format: "none" });
  });
});
