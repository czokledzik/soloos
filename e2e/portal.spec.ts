import { expect, test } from "@playwright/test";
import { sql } from "./db";

let projectId: number;
test.beforeAll(async () => {
  const [existing] = await sql`select id from projects where name = 'Portal demo'`;
  if (existing) return void (projectId = existing.id);
  const [org] = await sql`insert into organizations (name, status) values ('Portal Client', 'active') returning id`;
  const [p] = await sql`insert into projects (org_id, name, notes_md, hourly_rate) values (${org.id}, 'Portal demo', 'INTERNAL NOTE', 33300) returning id`;
  projectId = p.id;
  await sql`insert into tasks (project_id, title, status) values (${projectId}, 'Done task', 'done'), (${projectId}, 'Open task', 'todo')`;
  await sql`insert into doc_pages (project_id, title, body_md) values (${projectId}, 'Architecture', ${"```mermaid\nflowchart LR\n  Client --> Portal\n```"}), (${projectId}, 'Secret plan', 'do not show')`;
});

test("publish an update and a diagram, the client sees only those", async ({ page, browser }) => {
  await page.goto(`/projects/${projectId}/portal`);
  await page.getByRole("button", { name: "Turn on" }).click();
  const link = await page.getByLabel("Portal link").inputValue();
  expect(link).toMatch(/\/p\/[A-Za-z0-9_-]{43}$/);

  await page.getByRole("button", { name: "New update" }).click();
  await page.getByLabel("Update title").fill("Week 1");
  await page.getByLabel("Update text").fill("Booking form is **done**.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/^Published /)).toBeVisible();
  await page.getByLabel("Architecture").check();

  // A different browser with no session.
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const client = await anon.newPage();
  await client.goto(link);
  await expect(client.getByRole("heading", { name: "Portal demo" })).toBeVisible();
  await expect(client.getByText("1 of 2 tasks done")).toBeVisible();
  await expect(client.getByRole("heading", { name: "Week 1" })).toBeVisible();
  await expect(client.locator("strong", { hasText: "done" })).toBeVisible();
  await expect(client.locator("svg[id^=mmd-] >> text=Portal")).toBeVisible();
  // Neither the page nor the serialized React payload in it carries internal data.
  const html = await client.content();
  for (const hidden of ["INTERNAL NOTE", "Secret plan", "do not show", "Open task"]) expect(html).not.toContain(hidden);
  expect(await client.locator("body").innerText()).not.toContain("333,00");
  expect(await client.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");

  // The rest of the app stays locked for the anonymous visitor.
  await client.goto(`/projects/${projectId}`);
  await expect(client).toHaveURL(/\/login/);

  // Turning the portal off kills the link.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("button", { name: "Turn on" })).toBeVisible();
  const gone = await client.goto(link);
  expect(gone?.status()).toBe(404);
  await anon.close();
});
