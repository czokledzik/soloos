import { expect, test } from "@playwright/test";

const pages = ["/", "/search?q=test", "/tasks", "/projects", "/time", "/reports", "/pipeline", "/clients", "/messages", "/messages/new", "/settings", "/projects/1/scope", "/projects/1/docs", "/projects/1/portal"];

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

test("pages can't be framed", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});
