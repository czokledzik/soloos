import { expect, test } from "@playwright/test";
import { sql } from "./db";

let projectId: number;
// Idempotent: after a failure Playwright starts a new worker and runs beforeAll again.
test.beforeAll(async () => {
  const [existing] = await sql`select id from projects where name = 'Booking system'`;
  if (existing) return void (projectId = existing.id);
  const [org] = await sql`insert into organizations (name, status) values ('Clinic Dental', 'active') returning id`;
  const [p] = await sql`insert into projects (org_id, name, pricing, fixed_price, budget_hours)
    values (${org.id}, 'Booking system', 'fixed', 1000000, 40) returning id`;
  projectId = p.id;
});

test("brief saves from the overview", async ({ page }) => {
  await page.goto(`/projects/${projectId}/overview`);
  const brief = page.getByPlaceholder(/What is this project/);
  await brief.fill("Online booking for a dental clinic. Done = patients book without calling.");
  await brief.blur();
  await expect.poll(async () => (await sql`select brief_md from projects where id = ${projectId}`)[0].brief_md).toContain(
    "dental clinic",
  );
});

test("scope → baseline → change request approved → decision logged", async ({ page }) => {
  await page.goto(`/projects/${projectId}/scope`);
  await page.getByLabel("Scope").fill("In scope:\n- booking form\n- SMS reminders");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("SMS reminders")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Mark as agreed" }).click();
  await expect(page.getByText(/^Baselined /)).toBeVisible();

  const crs = page.locator("section", { has: page.getByRole("heading", { name: "Change requests" }) });
  await crs.getByRole("button", { name: "Add" }).click();
  await crs.getByLabel("What changes").fill("Google Calendar sync");
  await crs.getByLabel("Requested by").fill("Dr Kowalska");
  await crs.getByLabel("Hours").fill("+6h");
  await crs.getByLabel(/Price/).fill("1500");
  await crs.getByRole("button", { name: "Add change request" }).click();
  await expect(crs.getByText("+6:00 h")).toBeVisible();
  await expect(page.getByText("Waiting for a decision")).toBeVisible();

  await crs.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved change: Google Calendar sync")).toBeVisible();
  // 10 000 + 1 500 with approved changes; budget 40h + 6h.
  await expect(page.getByText("Price with approved changes").locator("..")).toContainText("11 500,00 zł");
  await expect(page.getByText("Budget with approved changes").locator("..")).toContainText("46.0h");
});

test("doc page with a Mermaid diagram, revisions and restore", async ({ page }) => {
  await page.goto(`/projects/${projectId}/docs`);
  page.once("dialog", (d) => d.accept("Architecture"));
  await page.getByRole("button", { name: "New page" }).click();
  await expect(page).toHaveURL(/docs\?page=\d+/);

  await page.getByLabel("Page content").fill("# Flow\n\n```mermaid\nflowchart LR\n  Patient --> Form --> Calendar\n```\n");
  // Live preview renders the diagram.
  await expect(page.locator("svg[id^=mmd-]").first()).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Flow" })).toBeVisible();
  await expect(page.locator("svg[id^=mmd-] >> text=Calendar")).toBeVisible();

  await page.locator("main section").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Page content").fill("# Flow v2\n\nNo diagram any more.");
  await page.getByLabel("Revision note").fill("Simplified");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Flow v2" })).toBeVisible();

  await page.getByRole("button", { name: /History \(2\)/ }).click();
  await page.getByRole("button", { name: /Architecture$/ }).click(); // the older revision
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.getByRole("heading", { name: "Flow", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /History \(3\)/ })).toBeVisible();
});

test("systems take links but refuse credentials", async ({ page }) => {
  await page.goto(`/projects/${projectId}/docs`);
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Systems" }) });
  await card.getByTitle("Add system").click();
  await card.getByLabel("Name").fill("n8n booking flow");
  await card.getByLabel("Kind").selectOption("n8n");
  await card.getByLabel("Link").fill("https://n8n.example.com/workflow/12");
  await card.getByLabel("Notes").fill("api_key=abcdef1234567890");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/looks like a password or key/)).toBeVisible();

  await card.getByLabel("Notes").fill("Key in 1Password → Clinic");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("link", { name: "n8n booking flow" })).toHaveAttribute("href", "https://n8n.example.com/workflow/12");
});

test("doc template adds pages with a placeholder count and starter questions", async ({ page }) => {
  await page.goto(`/projects/${projectId}/docs`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "From template" }).click();
  await expect(page.getByText(/Added \d+ pages and \d+ open questions/)).toBeVisible();
  const link = page.getByRole("link", { name: /1\. Przegląd i architektura/ });
  await link.click();
  await expect(page.getByRole("heading", { name: "Przed i po wdrożeniu" })).toBeVisible();
  await expect(link.getByTitle(/placeholders left to fill/)).toBeVisible();
});

test("open question answered into a decision, then a rule cites it", async ({ page }) => {
  await page.goto(`/projects/${projectId}/rules`);
  const questions = page.locator("section", { has: page.getByRole("heading", { name: "Open questions" }) });
  await questions.getByRole("button", { name: "Add" }).click();
  await questions.getByLabel("Question").fill("Do SMS reminders go out on Sundays?");
  await questions.getByLabel("Who answers").fill("Dr Kowalska");
  await questions.getByRole("button", { name: "Add question" }).click();
  const item = questions.getByRole("listitem").filter({ hasText: "SMS reminders go out on Sundays" });
  await expect(item).toContainText("asks Dr Kowalska");

  await item.getByRole("button", { name: "Answer" }).click();
  await item.getByLabel("Answer", { exact: true }).fill("No reminders on Sundays or public holidays");
  await item.getByRole("button", { name: "Save answer" }).click();
  await expect(item.getByText("Answered", { exact: true })).toBeVisible();
  await expect(item.getByRole("link", { name: /Decision: No reminders on Sundays/ })).toBeVisible();

  const rules = page.locator("section", { has: page.getByRole("heading", { name: "Business rules" }) });
  await rules.getByRole("button", { name: "Add" }).click();
  await rules.getByLabel("Rule").fill("Reminders only Monday to Saturday, never on public holidays");
  const source = rules.getByLabel("From decision");
  await source.selectOption((await source.locator("option", { hasText: "No reminders on Sundays" }).getAttribute("value"))!);
  await rules.getByRole("button", { name: "Add rule" }).click();
  const rule = rules.getByRole("listitem").filter({ hasText: "Monday to Saturday" });
  await expect(rule).toContainText("BR-01");
  await expect(rule).toContainText("not mapped to where it's implemented");

  await page.goto(`/projects/${projectId}/scope`);
  await expect(page.getByText("No reminders on Sundays or public holidays").first()).toBeVisible();
});
