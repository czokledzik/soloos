import { simpleParser } from "mailparser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contacts, db, threads } from "@/db";
import { fromParsedMail, normalizeSubject, stripQuoted } from "@/server/email";
import { lastEmailSync, runEmailSync, type EmailConfig, type MailSource } from "@/server/email-sync";
import { getThread, listThreads } from "@/server/message-queries";
import { makeOrg, resetDb } from "../db";

beforeEach(resetDb);

const eml = (h: Record<string, string>, body: string, contentType = "text/plain; charset=utf-8") =>
  Buffer.from(
    [...Object.entries(h).map(([k, v]) => `${k}: ${v}`), `Content-Type: ${contentType}`, "MIME-Version: 1.0", "", body].join(
      "\r\n",
    ),
  );

const first = eml(
  {
    From: "Anna Nowak <anna@florist.example>",
    To: "Tomasz <me@tomasz.example>",
    Subject: "Strona dla kwiaciarni",
    Date: "Mon, 05 Oct 2026 14:32:00 +0200",
    "Message-ID": "<a1@florist.example>",
  },
  "Dzień dobry,\r\npotrzebuję strony z zamówieniami.\r\n\r\n-- \r\nAnna Nowak\r\nKwiaciarnia Róża",
);
const reply = eml(
  {
    From: "Tomasz <me@tomasz.example>",
    To: "Anna Nowak <anna@florist.example>",
    Subject: "Re: Strona dla kwiaciarni",
    Date: "Mon, 05 Oct 2026 16:00:00 +0200",
    "Message-ID": "<b2@tomasz.example>",
    "In-Reply-To": "<a1@florist.example>",
    References: "<a1@florist.example>",
  },
  "Dzień dobry, chętnie pomogę. Budżet?\r\n\r\nW dniu 05.10.2026 o 14:32, Anna Nowak <anna@florist.example> pisze:\r\n> Dzień dobry,\r\n> potrzebuję strony",
);
const reply2 = eml(
  {
    From: "Anna Nowak <anna@florist.example>",
    To: "me@tomasz.example",
    Cc: "Jan <jan@florist.example>",
    Subject: "RE: Re: Strona dla kwiaciarni",
    Date: "Tue, 06 Oct 2026 09:00:00 +0200",
    "Message-ID": "<c3@florist.example>",
    "In-Reply-To": "<b2@tomasz.example>",
    References: "<a1@florist.example> <b2@tomasz.example>",
  },
  "Ok 3 tys.\r\n\r\nOn Mon, Oct 5, 2026 at 4:00 PM Tomasz <me@tomasz.example> wrote:\r\n> Dzień dobry, chętnie pomogę.",
);
const spam = eml(
  { From: "Promo <promo@shop.example>", To: "me@tomasz.example", Subject: "SALE", Date: "Tue, 06 Oct 2026 10:00:00 +0200", "Message-ID": "<s@shop.example>" },
  "Buy now",
);
const html = eml(
  { From: "anna@florist.example", To: "me@tomasz.example", Subject: "Logo", Date: "Wed, 07 Oct 2026 10:00:00 +0200", "Message-ID": "<d4@florist.example>" },
  "<p>Logo w&nbsp;załączniku</p><div>Pozdrawiam</div>",
  "text/html; charset=utf-8",
);

describe("email parsing", () => {
  it("reads ids, addresses and text", async () => {
    const p = fromParsedMail(await simpleParser(reply2))!;
    expect(p).toMatchObject({
      messageId: "c3@florist.example",
      inReplyTo: "b2@tomasz.example",
      references: ["a1@florist.example", "b2@tomasz.example"],
      from: [{ address: "anna@florist.example", name: "Anna Nowak" }],
      cc: [{ address: "jan@florist.example", name: "Jan" }],
    });
    expect(p.date).toEqual(new Date("2026-10-06T07:00:00Z"));
  });

  it("strips quoted replies and signatures", () => {
    expect(stripQuoted("Thanks!\n\nOn Mon, Oct 5, 2026 at 4:00 PM Bob <b@x.example> wrote:\n> hi")).toBe("Thanks!");
    expect(stripQuoted("Dzięki\n\nW dniu 05.10.2026 o 14:32, Anna <a@x.example> napisał(a):\n> hej")).toBe("Dzięki");
    expect(stripQuoted("See inline\n> question?\nanswer\n> more")).toBe("See inline\n> question?\nanswer");
    expect(stripQuoted("Hi\n\nFrom: Anna\nSent: Monday\nTo: me")).toBe("Hi");
    expect(stripQuoted("Body\n-- \nSig")).toBe("Body");
  });

  it("normalizes subjects", () => {
    expect(normalizeSubject("RE: Re: Fwd: Oferta")).toBe("Oferta");
    expect(normalizeSubject("Odp: PD: Oferta")).toBe("Oferta");
  });
});

describe("email sync", () => {
  const config: EmailConfig = {
    host: "imap.example",
    port: 993,
    secure: true,
    user: "me@tomasz.example",
    password: "x",
    mailboxes: ["INBOX", "Sent"],
    myAddresses: ["me@tomasz.example"],
    sinceDays: 30,
  };

  /** In-memory mailboxes: uid → raw message. */
  function fakeSource(boxes: Record<string, Buffer[]>, uidValidity = "1"): MailSource & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      async fetch(mailbox, state, _since, limit) {
        calls.push(`${mailbox}:${state?.lastUid ?? "none"}`);
        const all = (boxes[mailbox] ?? []).map((source, i) => ({ uid: i + 1, source }));
        const fresh = state && state.uidValidity === uidValidity ? all.filter((m) => m.uid > state.lastUid) : all;
        return { uidValidity, messages: fresh.slice(0, limit) };
      },
      async close() {},
    };
  }

  async function setup() {
    const org = await makeOrg({ name: "Kwiaciarnia Róża" });
    await db.insert(contacts).values([
      { orgId: org.id, name: "Anna Nowak", emails: ["anna@florist.example"] },
      { orgId: org.id, name: "Jan", emails: ["jan@florist.example"] },
    ]);
    return org;
  }

  it("threads a conversation across inbox and sent, skipping unknown senders", async () => {
    const org = await setup();
    const res = await runEmailSync(config, fakeSource({ INBOX: [first, reply2, spam, html], Sent: [reply] }));
    expect(res).toMatchObject({ imported: 4, skipped: 1, duplicates: 0, threadsCreated: 2 });

    const list = await listThreads({ orgId: org.id });
    expect(list.map((t) => [t.title, t.channel, t.messages.length])).toEqual([
      ["Logo", "email", 1],
      ["Strona dla kwiaciarni", "email", 3],
    ]);
    const thread = (await getThread(list[1].id))!;
    expect(thread.messages.map((m) => [m.sender, m.isMe, m.bodyMd])).toEqual([
      ["Anna Nowak", false, "Dzień dobry,\npotrzebuję strony z zamówieniami."],
      ["Me", true, "Dzień dobry, chętnie pomogę. Budżet?"],
      ["Anna Nowak", false, "Ok 3 tys."],
    ]);
    expect(thread.participants.find((p) => p.handle === "jan@florist.example")?.contactName).toBe("Jan");
    expect(list[0].messages[0].bodyMd).toBe("Logo w załączniku\n\nPozdrawiam");
  });

  it("resumes from the last UID and never duplicates", async () => {
    await setup();
    const boxes = { INBOX: [first], Sent: [] as Buffer[] };
    const source = fakeSource(boxes);
    await runEmailSync(config, source);
    boxes.INBOX.push(reply2);
    const second = await runEmailSync(config, source);
    expect(source.calls).toEqual(["INBOX:none", "Sent:none", "INBOX:1", "Sent:0"]);
    expect(second).toMatchObject({ imported: 1, duplicates: 0 });

    // A UIDVALIDITY change re-reads everything; Message-IDs keep it idempotent.
    const reset = await runEmailSync(config, fakeSource(boxes, "2"));
    expect(reset).toMatchObject({ imported: 0, duplicates: 2 });
    expect(await db.select().from(threads)).toHaveLength(1);
    expect((await lastEmailSync())?.duplicates).toBe(2);
  });

  it("reports a failing mailbox without losing the others", async () => {
    await setup();
    const source = fakeSource({ INBOX: [first] });
    const broken: MailSource = {
      fetch: (box, ...rest) => (box === "Sent" ? Promise.reject(new Error("Mailbox doesn't exist")) : source.fetch(box, ...rest)),
      close: async () => {},
    };
    const res = await runEmailSync(config, broken);
    expect(res.imported).toBe(1);
    expect(res.mailboxes).toEqual([
      { name: "INBOX", fetched: 1 },
      { name: "Sent", fetched: 0, error: "Mailbox doesn't exist" },
    ]);
  });
});

describe("stripQuoted edge cases", () => {
  it("handles Thunderbird-style Polish headers and keeps colons in normal text", () => {
    expect(stripQuoted("Ok\n\nW dniu 05.10.2026 o 14:32, Anna pisze:\n> hej\n>\n> x")).toBe("Ok");
    expect(stripQuoted("Agenda:\n- one\n- two")).toBe("Agenda:\n- one\n- two");
  });
});

describe("/api/cron/email-sync", () => {
  const call = (auth?: string) =>
    import("@/app/api/cron/email-sync/route").then(({ GET }) =>
      GET(new Request("https://x/api/cron/email-sync", { headers: auth ? { authorization: auth } : {} })),
    );

  it("needs the cron secret, then explains missing IMAP settings", async () => {
    vi.stubEnv("CRON_SECRET", "s".repeat(32));
    vi.stubEnv("IMAP_HOST", "");
    try {
      expect((await call()).status).toBe(401);
      expect((await call("Bearer wrong")).status).toBe(401);
      const res = await call(`Bearer ${"s".repeat(32)}`);
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/isn't configured/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
