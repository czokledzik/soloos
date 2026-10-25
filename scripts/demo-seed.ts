// Fills a database with made-up clients (in English, prices in USD), projects, time and messages for screenshots and demos.
// Only runs against a database whose name contains "demo"; wipes it first.
// Usage: DATABASE_URL=postgres://127.0.0.1:5432/soloos_demo pnpm db:migrate && DATABASE_URL=… pnpm demo:seed
import "dotenv/config";
import { addDays, setHours, setMinutes, startOfDay, subDays } from "date-fns";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../src/db/schema";

const url = process.env.DATABASE_URL!;
if (!/demo/.test(new URL(url).pathname)) throw new Error(`Refusing to wipe ${new URL(url).pathname}: name must contain "demo".`);

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const now = new Date();
const today = startOfDay(now);
const day = (offset: number) => addDays(today, offset).toISOString().slice(0, 10);
const at = (offset: number, h: number, m = 0) => setMinutes(setHours(addDays(today, offset), h), m);

async function wipe() {
  const rows = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%'`,
  );
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
}

async function main() {
  await wipe();

  // ---------- Clients ----------
  const [personal, acme, northwind, lumen, kestrel, greenfit] = await db
    .insert(s.organizations)
    .values([
      { name: "Personal", kind: "person", status: "internal", currency: "USD", notesMd: "Personal and side projects." },
      { name: "Acme Dental", status: "active", website: "https://acme-dental.example", currency: "USD", defaultRate: 9500, notesMd: "Three clinics in Austin. Decisions go through Sarah; IT questions to Tom." },
      { name: "Northwind Bakery", status: "active", website: "https://northwind.example", currency: "USD", defaultRate: 8500, notesMd: "Online shop + 2 cafés. Pays on time." },
      { name: "Studio Lumen", status: "past", website: "https://lumen.example", currency: "USD", defaultRate: 8000 },
      { name: "Kestrel Logistics", status: "lead", currency: "USD", website: "https://kestrel-logistics.example" },
      { name: "GreenFit Gym", status: "lead", currency: "USD" },
    ])
    .returning();
  const [cSarah, cTom, cOlivia, , cPeter, cKate] = await db
    .insert(s.contacts)
    .values([
      { orgId: acme.id, name: "Sarah Miller", role: "Practice manager", emails: ["sarah@acme-dental.example"], phone: "+1 512 555 0142" },
      { orgId: acme.id, name: "Tom Becker", role: "IT", emails: ["it@acme-dental.example"], telegram: "@tom_it" },
      { orgId: northwind.id, name: "Olivia Hart", role: "Owner", emails: ["olivia@northwind.example"] },
      { orgId: lumen.id, name: "Mark Lee", role: "Creative director", emails: ["marek@lumen.example"] },
      { orgId: kestrel.id, name: "Peter Grant", role: "CEO", emails: ["peter@kestrel-logistics.example"] },
      { orgId: greenfit.id, name: "Kate Moore", role: "Manager", facebookUrl: "https://facebook.com/kate.moore.example" },
    ])
    .returning();

  // ---------- Projects ----------
  const [booking, invoices, lumenSite, soloos] = await db
    .insert(s.projects)
    .values([
      {
        orgId: acme.id,
        name: "AI booking assistant",
        contractType: "b2b",
        pricing: "fixed",
        fixedPrice: 1800000,
        budgetHours: 100,
        hourlyRate: 9500,
        currency: "USD",
        startDate: day(-34),
        dueDate: day(24),
        briefMd:
          "Chat and phone assistant that books, moves and cancels appointments for **Acme Dental** (3 clinics).\n\n- Answers FAQ (prices only from the price list, never quotes treatment costs)\n- Books into the clinic calendar via n8n\n- Hands over to reception when unsure\n\n**Done when:** 80% of booking requests handled without a human, for 2 weeks.",
        scopeMd:
          "1. Website chat widget (English/Spanish)\n2. Booking, rescheduling and cancelling through the calendar API\n3. FAQ from the clinic's knowledge base\n4. Hand-over to reception (email + Telegram)\n5. Weekly report of conversations",
        scopeBaselinedAt: subDays(now, 30),
        portalToken: "demo-acme-portal-token-0123456789abcdefghij",
        portalProgress: true,
        portalHours: true,
        portalDecisions: true,
      },
      {
        orgId: northwind.id,
        name: "Invoice automation",
        contractType: "b2b",
        pricing: "hourly",
        hourlyRate: 8500,
        currency: "USD",
        budgetHours: 40,
        startDate: day(-20),
        dueDate: day(10),
        briefMd: "Shop orders → invoices in the accounting system, sent to the customer automatically. Monthly summary for the accountant.",
      },
      { orgId: lumen.id, name: "Portfolio website", status: "done", contractType: "b2b", pricing: "fixed", fixedPrice: 650000, currency: "USD", startDate: day(-90), dueDate: day(-45) },
      { orgId: personal.id, name: "SoloOS", pricing: "none", contractType: "internal", currency: "USD" },
    ])
    .returning();

  // ---------- Tasks ----------
  const t = (projectId: number, title: string, status: (typeof s.taskStatus.enumValues)[number], extra: Partial<typeof s.tasks.$inferInsert> = {}) => ({
    projectId,
    title,
    status,
    completedAt: status === "done" ? subDays(now, 3) : null,
    ...extra,
  });
  const taskRows = await db
    .insert(s.tasks)
    .values(
      [
        t(booking.id, "Calendar API: book / move / cancel", "done", { priority: 3 }),
        t(booking.id, "Chat widget on the website", "done", { priority: 2 }),
        t(booking.id, "FAQ knowledge base from the clinic's docs", "in_progress", { priority: 2, dueDate: day(1), estimateMin: 360 }),
        t(booking.id, "Hand-over to reception via Telegram", "in_progress", { priority: 3, dueDate: day(0), estimateMin: 180 }),
        t(booking.id, "SMS reminders the day before", "review", { priority: 1 }),
        t(booking.id, "Weekly conversation report", "todo", { priority: 2, dueDate: day(6) }),
        t(booking.id, "Test with reception staff", "todo", { priority: 2, dueDate: day(9) }),
        t(booking.id, "Spanish version of prompts", "backlog"),
        t(invoices.id, "Map shop order fields to invoice", "done", { priority: 2 }),
        t(invoices.id, "Send invoice PDF to the customer", "in_progress", { priority: 3, dueDate: day(2) }),
        t(invoices.id, "Monthly summary for the accountant", "todo", { priority: 1, dueDate: day(8) }),
        t(invoices.id, "Handle refunds (correction invoices)", "backlog"),
        t(soloos.id, "README with screenshots", "in_progress", { priority: 1 }),
        t(soloos.id, "Neon branch per preview deploy", "backlog"),
      ].map((r, i) => ({ ...r, sortOrder: (i + 1) * 1000 })),
    )
    .returning();
  const task = (title: string) => taskRows.find((r) => r.title === title)!.id;

  // ---------- Time (last ~5 weeks, weekdays) ----------
  const notes: Record<number, [string, string][]> = {
    [booking.id]: [
      ["Calendar API: book / move / cancel", "calendar webhooks"],
      ["Chat widget on the website", "widget styling + consent text"],
      ["FAQ knowledge base from the clinic's docs", "price list → FAQ"],
      ["Hand-over to reception via Telegram", "Telegram bot + routing"],
      ["SMS reminders the day before", "SMS provider test"],
    ],
    [invoices.id]: [
      ["Map shop order fields to invoice", "VAT rates per product"],
      ["Send invoice PDF to the customer", "email template"],
    ],
  };
  const entries: (typeof s.timeEntries.$inferInsert)[] = [];
  for (let d = -35; d <= 0; d++) {
    const date = addDays(today, d);
    // Weekdays only, but always today, so "Today" has numbers whatever day the media is recorded.
    if (d !== 0 && (date.getDay() === 0 || date.getDay() === 6)) continue;
    const plan: [number, number, number][] = [
      [booking.id, 9, 120 + ((d * 37) % 4) * 30],
      ...(d > -21 ? ([[invoices.id, 14, 60 + ((d * 13) % 3) * 30]] as [number, number, number][]) : []),
    ];
    if (d === 0) plan.splice(1);
    for (const [projectId, hour, min] of plan) {
      const list = notes[projectId];
      const [taskTitle, note] = list[Math.abs(d) % list.length];
      const rate = projectId === booking.id ? 9500 : 8500;
      const startedAt = at(d, hour, 15);
      entries.push({ projectId, taskId: task(taskTitle), startedAt, endedAt: new Date(+startedAt + min * 60_000), durationMin: min, note, rateSnapshot: rate });
    }
  }
  for (let d = -75; d <= -50; d += 3) {
    const startedAt = at(d, 10);
    entries.push({ projectId: lumenSite.id, startedAt, endedAt: new Date(+startedAt + 180 * 60_000), durationMin: 180, note: "layout + CMS", rateSnapshot: 8000 });
  }
  await db.insert(s.timeEntries).values(entries);
  await db.insert(s.runningTimer).values({
    projectId: booking.id,
    taskId: task("Hand-over to reception via Telegram"),
    startedAt: new Date(+now - 47 * 60_000),
    note: "routing rules",
  });

  // ---------- Payments ----------
  await db.insert(s.payments).values([
    { projectId: booking.id, label: "Advance", percent: 30, amount: 540000, dueDate: day(-33), paidAt: day(-31) },
    { projectId: booking.id, label: "Milestone: booking live", percent: 40, amount: 720000, dueDate: day(5) },
    { projectId: booking.id, label: "Final", percent: 30, amount: 540000, dueDate: day(30) },
    { projectId: lumenSite.id, label: "Full payment", amount: 650000, dueDate: day(-44), paidAt: day(-40) },
  ]);

  // ---------- Pipeline ----------
  await db.insert(s.opportunities).values([
    {
      orgId: kestrel.id,
      contactId: cPeter.id,
      title: "Driver dispatch bot (Telegram)",
      stage: "proposal",
      source: "referral",
      sourceDetail: "from Olivia (Northwind)",
      estValue: 2400000,
      nextAction: "Follow up on the proposal",
      nextActionAt: day(-1),
      offerSlug: "kestrel-dispatch",
    },
    {
      orgId: greenfit.id,
      contactId: cKate.id,
      title: "Membership renewals + reminders",
      stage: "contacted",
      source: "fb_group",
      sourceDetail: "n8n Community",
      originalPostMd: "Looking for someone to automate membership renewal reminders (SMS + email). We have about 600 members.",
      estValue: 600000,
      nextAction: "Send questions about their booking system",
      nextActionAt: day(0),
    },
    { orgId: northwind.id, contactId: cOlivia.id, title: "Loyalty card for the cafés", stage: "call", source: "email", estValue: 900000, nextAction: "Call on Friday", nextActionAt: day(2) },
    { orgId: greenfit.id, title: "Website refresh", stage: "new", source: "other", estValue: 400000 },
    { orgId: acme.id, contactId: cSarah.id, title: "AI booking assistant", stage: "won", source: "referral", estValue: 1800000, projectId: booking.id },
    { orgId: lumen.id, title: "Online shop", stage: "lost", source: "email", estValue: 1200000, lostReason: "Went with a Shopify agency" },
  ]);

  // ---------- Messages ----------
  const [thread] = await db
    .insert(s.threads)
    .values({ orgId: acme.id, projectId: booking.id, channel: "telegram", title: "Acme Dental – booking bot", source: "telegram", sourceKey: "telegram:demo-1", lastMessageAt: at(-1, 16, 20) })
    .returning();
  const [pMe, pSarah, pTom] = await db
    .insert(s.threadParticipants)
    .values([
      { threadId: thread.id, name: "Me", isMe: true },
      { threadId: thread.id, name: "Sarah Miller", contactId: cSarah.id },
      { threadId: thread.id, name: "Tom Becker", contactId: cTom.id },
    ])
    .returning();
  const chat: [typeof pMe, number, number, number, string][] = [
    [pSarah, -2, 9, 12, "Hi! Reception tried the bot yesterday, they love it 👏"],
    [pSarah, -2, 9, 13, "One thing: patients ask how much a root canal costs. The bot shouldn't quote prices, just invite them to a consultation."],
    [pMe, -2, 10, 2, "Thanks! Sure, I'll add a rule: no treatment prices, only the consultation fee and an invitation to book."],
    [pTom, -2, 11, 40, "Could we add SMS reminders the day before the visit? We already have a Twilio account."],
    [pMe, -2, 12, 5, "We can. It's outside the original scope, about 6h (+$570). I'll log it as a change for you to approve."],
    [pSarah, -1, 16, 15, "SMS reminders approved. And please send hand-overs to reception on Telegram, not by email."],
    [pSarah, -1, 16, 20, "When can we run a test with the reception team?"],
  ];
  const msgs = await db
    .insert(s.messages)
    .values(chat.map(([p, d, h, m, body], i) => ({ threadId: thread.id, participantId: p.id, sentAt: at(d, h, m), bodyMd: body, sourceKey: `telegram:demo-1:${i}` })))
    .returning();
  await db.insert(s.aiJobs).values({
    kind: "thread_insights",
    subject: `thread_insights:${thread.id}`,
    status: "done",
    provider: "api",
    prompt: "(demo)",
    startedAt: subDays(now, 1),
    finishedAt: subDays(now, 1),
    result: {
      summary:
        "Acme Dental's reception tested the bot and is happy with it. Sarah wants the bot to never quote treatment prices and hand-overs to go to reception on Telegram. Tom asked for SMS reminders (outside the scope, about 6h), which Sarah approved. Still open: when to test with the reception team.",
      decisions: [
        { title: "Hand-overs go to reception on Telegram instead of email", details: "", decidedBy: "Sarah (client)", decidedOn: day(-1), sourceMessageId: msgs[5].id },
      ],
      changeRequests: [
        { title: "SMS reminders the day before the visit", details: "Through the clinic's Twilio account.", requestedBy: "Tom (IT)", hoursImpact: "+6h", priceImpact: 570, sourceMessageId: msgs[3].id },
      ],
      tasks: [{ title: "Schedule a test with the reception team", dueDate: null }],
      openQuestions: ["When can we test with the reception team?"],
      replyDraft: "Hi Sarah! Thanks for approving the SMS reminders. I'll switch hand-overs to Telegram this week. For the reception test, how about Thursday or Friday at 1 pm?",
    },
  });

  const [mail] = await db
    .insert(s.threads)
    .values({ orgId: northwind.id, projectId: invoices.id, channel: "email", title: "Re: Invoices for shop customers", source: "email", sourceKey: "email:demo-2", lastMessageAt: at(-3, 13, 2) })
    .returning();
  const [mMe, mOlivia] = await db
    .insert(s.threadParticipants)
    .values([
      { threadId: mail.id, name: "Me", isMe: true },
      { threadId: mail.id, name: "Olivia Hart", handle: "olivia@northwind.example", contactId: cOlivia.id },
    ])
    .returning();
  await db.insert(s.messages).values([
    { threadId: mail.id, participantId: mOlivia.id, sentAt: at(-4, 9), bodyMd: "Hi, could invoices go out as soon as an order is paid, not when it ships?", sourceKey: "email:demo-2:1" },
    { threadId: mail.id, participantId: mMe.id, sentAt: at(-3, 13, 2), bodyMd: "Yes, I'll switch the trigger to the \"paid\" status. Refunds (credit notes) we'll handle separately.", sourceKey: "email:demo-2:2" },
  ]);

  await db.insert(s.interactions).values([
    { orgId: acme.id, contactId: cSarah.id, projectId: booking.id, channel: "meeting", direction: "both", occurredAt: at(-8, 11), title: "Demo for the clinic owners", bodyMd: "Showed booking + FAQ. Owners happy; want SMS reminders later." },
    { orgId: kestrel.id, contactId: cPeter.id, channel: "call", direction: "both", occurredAt: at(-6, 15), title: "Discovery call", bodyMd: "12 drivers, orders in Excel today. Wants Telegram bot for dispatch + daily summary." },
  ]);

  // ---------- Scope, decisions, rules, questions ----------
  const [dTelegram, dPrices] = await db
    .insert(s.decisions)
    .values([
      { projectId: booking.id, decidedOn: day(-1), title: "Hand-over to reception goes to Telegram, not email", decidedBy: "Sarah (client)", sourceMessageId: msgs[5].id, sourceNote: "Telegram" },
      { projectId: booking.id, decidedOn: day(-2), title: "The assistant never quotes treatment prices", detailsMd: "Only the consultation fee; everything else → invite to a consultation.", decidedBy: "Sarah (client)", sourceMessageId: msgs[1].id },
      { projectId: booking.id, decidedOn: day(-28), title: "Calendar stays in the clinic's current system", decidedBy: "both", sourceNote: "kick-off call" },
      { projectId: booking.id, decidedOn: day(-21), title: "Chat widget in English and Spanish", decidedBy: "me" },
    ])
    .returning();
  await db.insert(s.changeRequests).values([
    { projectId: booking.id, title: "SMS reminders the day before", detailsMd: "Through the clinic's Twilio account.", requestedBy: "Tom (IT)", requestedOn: day(-2), hoursImpactMin: 360, priceImpact: 57000, status: "approved", decidedOn: day(-1), sourceMessageId: msgs[3].id },
    { projectId: booking.id, title: "Voice channel (phone line)", requestedBy: "Sarah (client)", requestedOn: day(-5), hoursImpactMin: 1800, priceImpact: 285000, status: "proposed" },
    { projectId: booking.id, title: "Drop the weekly PDF report", requestedBy: "Sarah (client)", requestedOn: day(-15), hoursImpactMin: -120, priceImpact: -19000, status: "rejected", decidedOn: day(-14) },
  ]);
  await db.insert(s.businessRules).values([
    { projectId: booking.id, code: "BR-01", title: "Never quote treatment prices", kind: "constraint", detailsMd: "Only the consultation fee.", implementedIn: "main prompt", sourceDecisionId: dPrices.id },
    { projectId: booking.id, code: "BR-02", title: "Unsure → hand over to reception on Telegram", kind: "action", implementedIn: "handover workflow", sourceDecisionId: dTelegram.id },
    { projectId: booking.id, code: "BR-03", title: "Bookings only during opening hours, min. 2h ahead", kind: "constraint", implementedIn: "booking workflow" },
    { projectId: booking.id, code: "BR-04", title: "Each clinic has its own calendar", kind: "fact" },
  ]);
  await db.insert(s.openQuestions).values([
    { projectId: booking.id, code: "Q-01", question: "When can we test with the reception staff?", owner: "Sarah (client)", askedOn: day(-1), dueDate: day(3) },
    { projectId: booking.id, code: "Q-02", question: "Do children's appointments need a parent's phone number?", owner: "Sarah (client)", whereInDocs: "2. Booking flow", askedOn: day(-6), status: "in_progress" },
    { projectId: booking.id, code: "Q-03", question: "Which clinic is the default when the patient doesn't say?", owner: "Tom (IT)", askedOn: day(-20), status: "answered", answerMd: "The downtown clinic.", closedOn: day(-18) },
  ]);

  // ---------- Docs, systems, updates ----------
  const flow = `# Booking flow

\`\`\`mermaid
flowchart LR
  P([Patient]) --> W[Chat widget]
  W --> A{Assistant}
  A -->|FAQ| K[(Knowledge base)]
  A -->|book / move / cancel| N[n8n] --> C[(Clinic calendar)]
  A -->|unsure| R[Reception on Telegram]
  N --> S[SMS reminder]
\`\`\`

1. The patient asks in the widget (English or Spanish).
2. The assistant answers FAQ from the knowledge base, never treatment prices (BR-01).
3. Bookings go through n8n into the clinic's calendar (one per clinic, BR-04).
4. Anything unclear is handed over to reception on Telegram (BR-02).
`;
  const pages = await db
    .insert(s.docPages)
    .values([
      { projectId: booking.id, title: "1. Overview", bodyMd: "# Overview\n\nAI assistant for booking appointments in three Acme Dental clinics.\n\n| | |\n|---|---|\n| Channels | website chat, Telegram (reception) |\n| Languages | English, Spanish |\n| Go-live | early December |", sortOrder: 1000, published: true },
      { projectId: booking.id, title: "2. Booking flow", bodyMd: flow, sortOrder: 2000, published: true },
      { projectId: booking.id, title: "3. Data and security", bodyMd: "# Data and security\n\n- No medical data is stored in the chat logs.\n- Credentials live in n8n, never in documents.", sortOrder: 3000 },
    ])
    .returning();
  await db.insert(s.docRevisions).values(pages.map((p) => ({ pageId: p.id, title: p.title, bodyMd: p.bodyMd, note: "first version" })));
  await db.insert(s.systems).values([
    { projectId: booking.id, kind: "repo", name: "acme-booking-assistant", url: "https://github.com/example/acme-booking-assistant", sortOrder: 1000 },
    { projectId: booking.id, kind: "n8n", name: "Booking workflows", url: "https://n8n.acme-dental.example", notes: "Credentials stay in n8n.", sortOrder: 2000 },
    { projectId: booking.id, kind: "vercel", name: "Widget hosting", url: "https://vercel.com/example/acme-widget", sortOrder: 3000 },
  ]);
  await db.insert(s.projectUpdates).values([
    { projectId: booking.id, title: "Booking works end to end", bodyMd: "Patients can book, move and cancel in all three clinics. Next: hand-over to reception on Telegram.", publishedAt: subDays(now, 4) },
    { projectId: booking.id, title: "Chat widget is live on the test site", bodyMd: "Try it on the staging site; feedback welcome.", publishedAt: subDays(now, 15) },
  ]);

  console.log(`Demo data ready: ${entries.length} time entries, ${taskRows.length} tasks. Portal: /p/demo-acme-portal-token-0123456789abcdefghij`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
