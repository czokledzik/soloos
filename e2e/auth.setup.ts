import { expect, test as setup } from "@playwright/test";
import { E2E_PASSWORD } from "../playwright.config";

setup("log in", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);

  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Wrong password.")).toBeVisible();

  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.context().storageState({ path: "e2e/.auth/session.json" });
});
