// Screenshots and GIFs for the README, taken from a running app filled by `pnpm demo:seed`.
// Mutates the demo data (starts a timer, moves a task, saves a chat), so re-seed before re-running.
// Usage: DEMO_URL=http://127.0.0.1:3200 DEMO_PASSWORD=… FFMPEG=/path/to/ffmpeg pnpm demo:media
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

const base = process.env.DEMO_URL ?? "http://127.0.0.1:3200";
const password = process.env.DEMO_PASSWORD ?? "demo-password";
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const out = "docs/media";
const viewport = { width: 1440, height: 900 };
const portal = "/p/demo-acme-portal-token-0123456789abcdefghij";

// Playwright videos have no mouse pointer; draw one so clicks and drags are visible.
const cursor = () => {
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(239,68,68,.35);border:2px solid rgb(239,68,68);left:-50px;top:-50px;transition:transform .1s";
    document.body.append(dot);
    window.addEventListener("pointermove", (e) => Object.assign(dot.style, { left: `${e.clientX}px`, top: `${e.clientY}px` }), true);
    window.addEventListener("pointerdown", () => (dot.style.transform = "scale(.7)"), true);
    window.addEventListener("pointerup", () => (dot.style.transform = ""), true);
  });
};

async function login(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(`${base}/`);
  return page;
}

async function settle(page: Page, path?: string) {
  if (path) await page.goto(base + path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
}

async function screenshots(browser: Browser) {
  const shots: [name: string, path: string, scheme?: "dark"][] = [
    ["today", "/"],
    ["board", "/projects/1"],
    ["board-dark", "/projects/1", "dark"],
    ["overview", "/projects/1/overview"],
    ["scope", "/projects/1/scope"],
    ["rules", "/projects/1/rules"],
    ["docs", "/projects/1/docs"],
    ["time", "/time"],
    ["reports", "/reports"],
    ["pipeline", "/pipeline"],
    ["client", "/clients/2"],
    ["thread", "/messages/1"],
    ["portal", portal],
  ];
  for (const [name, path, scheme] of shots) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: scheme ?? "light", locale: "en-GB", timezoneId: "Europe/Warsaw" });
    const page = await login(context);
    await settle(page, path);
    if (name === "docs") {
      await page.getByRole("link", { name: "2. Booking flow" }).click();
      await settle(page);
    }
    await page.screenshot({ path: join(out, `${name}.png`) });
    await context.close();
    console.log("screenshot", name);
  }
}

async function gif(browser: Browser, name: string, script: (page: Page) => Promise<void>, start = "/") {
  const dir = mkdtempSync(join(tmpdir(), "soloos-video-"));
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport: size, recordVideo: { dir, size }, locale: "en-GB", timezoneId: "Europe/Warsaw" });
  await context.addInitScript(cursor);
  const recording = Date.now();
  const page = await login(context);
  await settle(page, start);
  const skip = (Date.now() - recording) / 1000;
  await page.waitForTimeout(1000);
  await script(page);
  await page.waitForTimeout(1500);
  await context.close();
  const video = join(dir, readdirSync(dir)[0]);
  // Drop the login at the start.
  const filters = "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4";
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", skip.toFixed(1), "-i", video, "-vf", filters, join(out, `${name}.gif`)]);
  rmSync(dir, { recursive: true });
  console.log("gif", name);
}

async function main() {
  mkdirSync(out, { recursive: true });
  // Without this, headless Chromium on Linux hints fonts so hard that letter spacing looks off.
  const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
  await screenshots(browser);

  await gif(browser, "command-palette", async (page) => {
    await page.waitForTimeout(800);
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
    await page.keyboard.type("start invoice pdf", { delay: 90 });
    await page.waitForTimeout(900);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("reports", { delay: 90 });
    await page.waitForTimeout(700);
    await page.keyboard.press("Enter");
    await settle(page);
  });

  await gif(
    browser,
    "board",
    async (page) => {
      const card = page.getByText("Weekly conversation report").first();
      const target = page.getByText("FAQ knowledge base from the clinic's docs").first();
      const from = (await card.boundingBox())!;
      const to = (await target.boundingBox())!;
      await page.mouse.move(from.x - 200, from.y + 200);
      await page.mouse.move(from.x + 40, from.y + 8, { steps: 15 });
      await page.waitForTimeout(300);
      await page.mouse.down();
      await page.mouse.move(to.x + 40, to.y + 10, { steps: 30 });
      await page.waitForTimeout(400);
      await page.mouse.up();
      await page.waitForTimeout(800);
      await page.getByText("Weekly conversation report").first().click();
      await page.waitForTimeout(1500);
    },
    "/projects/1",
  );

  await gif(
    browser,
    "paste-chat",
    async (page) => {
      const select = (label: string) => page.locator("label", { hasText: label }).locator("select").first();
      await select("Client").selectOption({ label: "Northwind Bakery" });
      await page.waitForTimeout(400);
      await select("Channel").selectOption({ label: "WhatsApp" });
      const box = page.getByLabel("Pasted conversation");
      await box.click();
      await box.fill(
        [
          "10/21/26, 9:12 AM - Olivia Hart: Hi! Could we also handle credit notes for refunds?",
          "10/21/26, 9:14 AM - Me: Sure, that's about 4h. I'll send a quote today.",
          "10/21/26, 9:20 AM - Olivia Hart: Great, thanks 🙌",
        ].join("\n"),
      );
      await page.waitForTimeout(900);
      await page.getByRole("button", { name: "Split into messages" }).click();
      await page.waitForTimeout(1200);
      await page.getByLabel("Which sender is you?").selectOption("Me");
      await page.waitForTimeout(1000);
      await page.getByRole("button", { name: /^Save \d+ messages$/ }).click();
      await settle(page);
      await page.waitForTimeout(800);
    },
    "/messages/new",
  );

  await gif(
    browser,
    "portal",
    async (page) => {
      await page.waitForTimeout(800);
      for (const link of ["Decisions", "2. Booking flow", "Hours report"]) {
        await page.getByRole("link", { name: link }).first().click();
        await page.waitForTimeout(1800);
      }
    },
    portal,
  );

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
