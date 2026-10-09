import { expect, test } from "@playwright/test";

const pages = ["/", "/tasks", "/projects", "/time", "/reports", "/pipeline", "/clients", "/messages", "/messages/new", "/settings"];

test.describe("every page renders", () => {
  for (const path of pages) {
    test(path, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByText("No timer running")).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test("API-style requests without a session are rejected", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const res = await ctx.request.post("/projects", { data: "x", maxRedirects: 0 });
  expect(res.status()).toBe(401);
  await ctx.close();
});
