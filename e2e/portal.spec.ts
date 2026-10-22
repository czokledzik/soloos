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
  await sql`insert into time_entries (project_id, started_at, ended_at, duration_min, note, rate_snapshot) values (${projectId}, '2026-10-01 10:00+02', '2026-10-01 11:30+02', 90, 'Formularz rezerwacji', 33300)`;
  await sql`insert into decisions (project_id, decided_on, title, decided_by, source_note) values (${projectId}, '2026-10-02', 'Płatności przez Przelewy24', 'both', 'SOURCE NOTE')`;
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
  // Optional sections: progress and decisions now, the hours report later.
  await page.getByLabel(/Task progress/).check();
  await page.getByLabel(/Decision log/).check();
  await expect(page.getByLabel(/Decision log/)).toBeChecked();

  // A different browser with no session.
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const client = await anon.newPage();
  await client.goto(link);
  await expect(client.getByRole("heading", { name: "Portal demo" })).toBeVisible();
  await expect(client.getByText("ukończone 1 z 2")).toBeVisible();
  await expect(client.getByRole("heading", { name: "Week 1" })).toBeVisible();
  await expect(client.locator("strong", { hasText: "done" })).toBeVisible();

  // Each section and published doc is its own tab.
  const sections = client.getByRole("navigation", { name: "Sekcje" });
  await expect(sections.getByRole("link", { name: "Przegląd" })).toHaveAttribute("aria-current", "page");
  await expect(sections.getByRole("link", { name: "Raport godzin" })).toHaveCount(0);
  await sections.getByRole("link", { name: "Decyzje" }).click();
  await expect(client.getByRole("heading", { name: "Płatności przez Przelewy24" })).toBeVisible();
  await expect(client.getByText(/2 października 2026 · wspólnie/)).toBeVisible();
  await sections.getByRole("link", { name: "Architecture" }).click();
  await expect(client).toHaveURL(/\?tab=\d+$/);
  await expect(client.getByRole("heading", { name: "Week 1" })).toBeHidden();
  await expect(client.locator("svg[id^=mmd-] >> text=Portal")).toBeVisible();

  // Light by default; the switch is remembered for the portal only.
  await expect(client.locator("html")).toHaveClass(/\blight\b/);
  await client.getByRole("button", { name: "Przełącz na ciemny motyw" }).click();
  await expect(client.locator("html")).toHaveClass(/\bdark\b/);
  await client.reload();
  await expect(client.locator("html")).toHaveClass(/\bdark\b/);

  // The PDF view has everything on one page, always light, diagrams drawn without pan/zoom.
  await client.getByRole("link", { name: "Pobierz PDF" }).click();
  await expect(client).toHaveURL(/\/print$/);
  await expect(client).toHaveTitle("Portal demo — Portal Client");
  await expect(client.locator("html")).toHaveClass(/\blight\b/);
  await expect(client.getByRole("heading", { name: "Architecture" })).toBeVisible();
  // The PDF is the documentation only: no progress or updates.
  await expect(client.getByRole("heading", { name: "Week 1" })).toHaveCount(0);
  await expect(client.locator("svg[id^=mmd-] >> text=Portal")).toBeVisible();
  await expect(client.getByRole("button", { name: "Zapisz jako PDF" })).toBeVisible();
  const printHtml = await client.content();
  for (const hidden of ["INTERNAL NOTE", "Secret plan", "do not show", "Open task"]) expect(printHtml).not.toContain(hidden);
  await client.getByRole("link", { name: "Wróć" }).click();
  // Neither the page nor the serialized React payload in it carries internal data.
  const html = await client.content();
  for (const hidden of ["INTERNAL NOTE", "Secret plan", "do not show", "Open task", "SOURCE NOTE", "Formularz rezerwacji"]) {
    expect(html).not.toContain(hidden);
  }
  expect(await client.locator("body").innerText()).not.toContain("333,00");

  // The hours report shows the work, its value and the rate once switched on.
  await page.getByLabel(/Hours report/).check();
  await expect(page.getByLabel(/Hours report/)).toBeChecked();
  // The report with amounts is never what the client lands on: it comes last in the menu.
  await client.goto(link);
  const menu = client.getByRole("navigation", { name: "Sekcje" }).getByRole("link");
  await expect(menu.first()).toHaveAttribute("aria-current", "page");
  await expect(menu.last()).toHaveText("Raport godzin");
  await client.goto(`${link}?tab=hours`);
  await expect(client.getByText("Formularz rezerwacji")).toBeVisible();
  await expect(client.getByText("1 h 30 min").first()).toBeVisible();
  await expect(client.getByText(/stawka 333,00/)).toBeVisible();
  await expect(client.getByText("Wartość prac")).toBeVisible();
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
