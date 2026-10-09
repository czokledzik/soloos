import { expect, test } from "@playwright/test";
import { E2E_RUNNER_TOKEN } from "../playwright.config";
import { sql } from "./db";

let threadId: number;
let projectId: number;
test.beforeAll(async () => {
  const [existing] = await sql`select id, project_id from threads where title = 'AI demo chat'`;
  if (existing) return void ((threadId = existing.id), (projectId = existing.project_id));
  const [org] = await sql`insert into organizations (name, status) values ('AI Client', 'active') returning id`;
  const [p] = await sql`insert into projects (org_id, name) values (${org.id}, 'AI demo project') returning id`;
  projectId = p.id;
  const [t] = await sql`insert into threads (org_id, project_id, channel, title, source, last_message_at)
    values (${org.id}, ${projectId}, 'whatsapp', 'AI demo chat', 'paste', now()) returning id`;
  threadId = t.id;
  await sql`insert into messages (thread_id, sent_at, body_md) values (${threadId}, now(), 'Let us use Stripe for payments')`;
});

test("ask Claude on a thread; the runner answers; log a suggested decision", async ({ page, request }) => {
  await page.goto(`/messages/${threadId}`);
  await page.getByRole("button", { name: "Summarize & extract" }).click();
  await expect(page.getByText("Waiting for the local runner to pick this up…")).toBeVisible();

  // Play the local runner.
  const auth = { authorization: `Bearer ${E2E_RUNNER_TOKEN}` };
  const job = await (await request.post("/api/ai/runner/claim", { headers: auth })).json();
  expect(job.prompt).toContain("Let us use Stripe for payments");
  const done = await request.post("/api/ai/runner/complete", {
    headers: auth,
    data: {
      id: job.id,
      result: {
        summary: "They want online payments.",
        decisions: [{ title: "Use Stripe for payments", details: "", decidedBy: "client", decidedOn: null, sourceMessageId: null }],
        changeRequests: [],
        tasks: [{ title: "Create Stripe account", dueDate: null }],
        openQuestions: [],
        replyDraft: "Sounds good, I'll set up Stripe.",
      },
    },
  });
  expect((await done.json()).status).toBe("done");

  // The page polls and shows the suggestions.
  await expect(page.getByText("They want online payments.")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByLabel("Added")).toBeVisible();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByLabel("Added")).toHaveCount(2);

  const [decision] = await sql`select title from decisions where project_id = ${projectId}`;
  expect(decision.title).toBe("Use Stripe for payments");
  const [task] = await sql`select title from tasks where project_id = ${projectId}`;
  expect(task.title).toBe("Create Stripe account");
});

test("runner endpoints reject a wrong token", async ({ request }) => {
  const res = await request.post("/api/ai/runner/claim", { headers: { authorization: "Bearer nope" } });
  expect(res.status()).toBe(401);
});
