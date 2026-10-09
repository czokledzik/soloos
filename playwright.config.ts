import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run a production build against their own database
// (`soloos_e2e`, reset on every run), with a password so the login gate is covered.
const PORT = 3100;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://127.0.0.1:5432/soloos_e2e";
export const E2E_PASSWORD = "e2e-password";

const env = {
  DATABASE_URL: E2E_DATABASE_URL,
  APP_PASSWORD: E2E_PASSWORD,
  APP_TIMEZONE: "Europe/Warsaw",
  NEXT_DIST_DIR: ".next-e2e",
};

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Tests share one database, so keep them in order.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    timezoneId: "Europe/Warsaw",
    locale: "en-GB",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/session.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "scripts/e2e-server.sh",
    url: `http://127.0.0.1:${PORT}/login`,
    env: { ...env, PORT: String(PORT) },
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
  },
});
