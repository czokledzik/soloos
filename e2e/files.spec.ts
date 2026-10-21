import { expect, test } from "@playwright/test";
import { sql } from "./db";

let projectId: number;
let orgId: number;
test.beforeAll(async () => {
  const [existing] = await sql`select id, org_id from projects where name = 'Files demo'`;
  if (existing) return void ([projectId, orgId] = [existing.id, existing.org_id]);
  const [org] = await sql`insert into organizations (name, status) values ('Files Client', 'active') returning id`;
  const [p] = await sql`insert into projects (org_id, name) values (${org.id}, 'Files demo') returning id`;
  [projectId, orgId] = [p.id, org.id];
});

test("upload a PDF to a project, open it, see it on the client, delete it", async ({ page, browser }) => {
  await page.goto(`/projects/${projectId}/files`);
  await page.getByLabel("Note").fill("signed");
  await page.getByLabel("Files to upload").setInputFiles({
    name: "Oferta – Files demo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nhello"),
  });
  const link = page.getByRole("link", { name: "Oferta – Files demo.pdf", exact: true });
  await expect(link).toBeVisible();
  await expect(page.getByText(/signed/)).toBeVisible();

  const href = await link.getAttribute("href");
  // Fetched from the page: the session cookie is Secure, which Playwright's own request client won't send over http.
  const file = await page.evaluate(async (url) => {
    const r = await fetch(url);
    return { type: r.headers.get("content-type"), disposition: r.headers.get("content-disposition"), body: await r.text() };
  }, href!);
  expect(file).toEqual({
    type: "application/pdf",
    disposition: expect.stringMatching(/^inline; /),
    body: "%PDF-1.7\nhello",
  });

  // Without a session the file isn't reachable.
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const blocked = await anon.request.get(href!, { maxRedirects: 0 });
  expect(blocked.status()).toBe(307);
  await anon.close();

  await page.goto(`/clients/${orgId}`);
  await expect(page.getByRole("link", { name: "Oferta – Files demo.pdf", exact: true })).toBeVisible();

  await page.goto(`/projects/${projectId}/files`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("link", { name: "Oferta – Files demo.pdf", exact: true }).hover();
  await page.getByRole("button", { name: "Delete Oferta – Files demo.pdf" }).click();
  await expect(page.getByText("No files yet.")).toBeVisible();
});
