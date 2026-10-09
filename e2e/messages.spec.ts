import { expect, test } from "@playwright/test";
import { sql } from "./db";


let orgId: number;
// Idempotent: after a failure Playwright starts a new worker and runs beforeAll again.
test.beforeAll(async () => {
  const [existing] = await sql`select id from organizations where name = 'Kwiaciarnia Róża'`;
  if (existing) return void (orgId = existing.id);
  const [org] = await sql`insert into organizations (name, status) values ('Kwiaciarnia Róża', 'active') returning id`;
  orgId = org.id;
  await sql`insert into contacts (org_id, name) values (${orgId}, 'Anna Nowak')`;
});

test("paste a WhatsApp chat, fix it, see it on the client timeline", async ({ page }) => {
  await page.goto(`/clients/${orgId}`);
  await page.getByRole("link", { name: "Paste chat" }).click();
  await expect(page).toHaveURL(new RegExp(`/messages/new\\?org=${orgId}`));

  await page.getByLabel("Pasted conversation").fill(
    [
      "05.10.2026, 14:32 - Anna Nowak: Dzień dobry, potrzebuję strony",
      "05.10.2026, 14:40 - Tomasz: Dzień dobry! Jaki budżet?",
      "05.10.2026, 14:45 - Anna Nowak: Około 3 tysiące",
      "I termin do listopada",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Split into messages" }).click();
  await expect(page.getByText("WhatsApp export · 3 messages")).toBeVisible();

  await page.getByLabel("Which sender is you?").selectOption("Tomasz");
  // Split the last message in two at the line break.
  const last = page.getByLabel("Message", { exact: true }).last();
  await last.click();
  await last.evaluate((el: HTMLTextAreaElement) => {
    const at = el.value.indexOf("I termin");
    el.setSelectionRange(at, at);
  });
  await last.press("Control+Enter");
  await expect(page.getByLabel("Message", { exact: true })).toHaveCount(4);

  await page.getByRole("button", { name: "Save 4 messages" }).click();
  await expect(page).toHaveURL(/\/messages\/\d+$/);
  await expect(page.getByText("I termin do listopada")).toBeVisible();
  // Anna was matched to the existing contact.
  await expect(page.getByLabel("Contact for Anna Nowak")).toHaveValue(/\d+/);

  await page.goto(`/clients/${orgId}`);
  await expect(page.getByText("Dzień dobry! Jaki budżet?")).toBeVisible();
  await expect(page.getByText("4 messages")).toBeVisible();
});

test("split a logged conversation into messages", async ({ page }) => {
  await sql`insert into interactions (org_id, channel, direction, body_md, occurred_at)
    values (${orgId}, 'facebook', 'both', ${"Anna Nowak\nCzy możemy przesunąć termin?\nYou sent\nTak, jasne\nAnna Nowak\nDzięki!"}, '2026-10-07 10:00+02')`;
  await page.goto(`/clients/${orgId}`);
  await page.getByText("Czy możemy przesunąć termin?").hover();
  await page.getByTitle("Split into messages").click();
  await expect(page.getByRole("heading", { name: "Split conversation into messages" })).toBeVisible();
  await page.getByRole("button", { name: "Split into messages" }).click();
  await expect(page.getByText("Messenger copy · 3 messages")).toBeVisible();
  await expect(page.getByLabel("Which sender is you?")).toHaveValue("Me");
  await page.getByRole("button", { name: "Save 3 messages" }).click();
  await expect(page).toHaveURL(/\/messages\/\d+$/);

  const [{ count }] = await sql`select count(*)::int as count from interactions where org_id = ${orgId}`;
  expect(count).toBe(0);
});

test("import a Telegram export from Settings", async ({ page }) => {
  await page.goto("/settings");
  const panel = page.locator("section", { has: page.getByRole("heading", { name: "Telegram chats" }) }).last();
  await panel.getByLabel("result.json").setInputFiles("test/fixtures/telegram-full.json");
  await panel.getByRole("button", { name: "Preview" }).click();
  await expect(panel.getByLabel("You are")).toHaveValue("user1001");
  // Anna Nowak is a contact of the florist, so her chat is pre-assigned.
  await expect(panel.getByLabel("Client for Anna Nowak")).toHaveValue(String(orgId));
  // She's in the group chat too; skip that one.
  await expect(panel.getByLabel("Client for Shop project")).toHaveValue(String(orgId));
  await panel.getByLabel("Client for Shop project").selectOption({ label: "Skip" });
  await panel.getByRole("button", { name: "Import 1 chat" }).click();
  await expect(panel.getByText("Imported 4 messages in 1 new threads")).toBeVisible();

  await page.goto("/messages?q=ofertę");
  await expect(page.getByRole("link", { name: /Anna Nowak/ })).toBeVisible();
});
