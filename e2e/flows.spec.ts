import { expect, test, type Page } from "@playwright/test";
import { sql } from "./db";

test.afterAll(() => sql.end());

async function dialog(page: Page, title: string) {
  const d = page.getByRole("dialog", { name: title });
  await expect(d).toBeVisible();
  return d;
}

test("project → task → timer → logged time", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  const d = await dialog(page, "New project");
  await d.getByLabel("Name", { exact: true }).fill("Shop redesign");
  await d.getByLabel("New client name").fill("Bakery Kowalski");
  await d.getByLabel("Hourly rate").fill("150");
  await d.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/projects\/\d+$/);
  await expect(page.getByRole("heading", { name: "Shop redesign" })).toBeVisible();

  await page.getByRole("button", { name: "New task" }).click();
  const t = await dialog(page, "New task");
  await t.getByLabel("Title").fill("Product page mockup");
  await t.getByRole("button", { name: "Create task" }).click();
  const row = page.getByText("Product page mockup");
  await expect(row).toBeVisible();

  // Start the timer on the task: the header bar shows it.
  await page.getByRole("button", { name: "Start timer" }).last().click();
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "Product page mockup" })).toBeVisible();

  // Pretend 25 minutes have passed, then stop.
  await sql`update running_timer set started_at = now() - interval '25 minutes'`;
  await page.reload();
  await header.getByRole("button", { name: "Stop" }).click();
  await expect(header.getByText("No timer running")).toBeVisible();

  await page.getByRole("link", { name: "Time" }).last().click();
  await expect(page.getByText("0:25").first()).toBeVisible();
  const [entry] = await sql`select duration_min, rate_snapshot, billable from time_entries`;
  expect(entry).toEqual({ duration_min: 25, rate_snapshot: 15000, billable: true });
});

test("quick-add lead from a pasted post, then convert to a project", async ({ page }) => {
  await page.goto("/pipeline");
  await page.getByRole("button", { name: /add lead/i }).first().click();
  const d = await dialog(page, "Add lead");
  await d.getByLabel("Their post / request").fill("Potrzebuję automatyzacji faktur w n8n\nKontakt priv");
  await d.getByLabel("Person").fill("Ewa Zielińska");
  await d.getByLabel("Estimated value (optional)").fill("3000");
  await d.getByRole("button", { name: "Add lead" }).click();

  await expect(page).toHaveURL(/\/pipeline\?opp=\d+/);
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Potrzebuję automatyzacji faktur w n8n").first()).toBeVisible();

  await sheet.getByRole("button", { name: /project/i }).first().click();
  await expect(page).toHaveURL(/\/projects\/\d+/);
  await expect(page.getByRole("heading", { name: "Potrzebuję automatyzacji faktur w n8n" })).toBeVisible();
  const [org] = await sql`select status from organizations where name = 'Ewa Zielińska'`;
  expect(org.status).toBe("active");
});

test("log time manually from the Time page", async ({ page }) => {
  await page.goto("/time");
  await page.getByRole("button", { name: /log time/i }).first().click();
  const d = await dialog(page, "Log time");
  await d.locator("select[name=projectId]").selectOption({ label: "Shop redesign" });
  await d.getByLabel("or Duration").fill("1:30");
  await d.getByLabel("Note").fill("Client call");
  await d.getByRole("button", { name: /save|log/i }).click();
  await expect(page.getByText("Client call").first()).toBeVisible();
});

test("command palette jumps to a project", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox").fill("Shop redesign");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects\/\d+/);
});

test("reports export CSV", async ({ page }) => {
  await page.goto("/reports?period=this-year");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /csv/i }).click();
  const file = await download;
  const text = await (await file.createReadStream()).toArray();
  const csv = Buffer.concat(text).toString("utf8");
  expect(csv).toContain("Shop redesign");
});
