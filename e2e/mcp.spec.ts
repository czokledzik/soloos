import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const verifier = "e2e-verifier-0123456789-abcdefghijklmnop";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const redirectUri = "http://localhost:9/callback";

test("connector flow: discover → register → consent → token → call a tool", async ({ page, request }) => {
  // Unauthenticated MCP call points to the resource metadata.
  const unauth = await request.post("/api/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(unauth.status()).toBe(401);
  const resourceUrl = /resource_metadata="([^"]+)"/.exec(unauth.headers()["www-authenticate"])![1];
  const resource = await (await request.get(resourceUrl)).json();
  const as = await (await request.get(`${resource.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json();
  expect(as.code_challenge_methods_supported).toEqual(["S256"]);

  const reg = await request.post(as.registration_endpoint, { data: { client_name: "Claude", redirect_uris: [redirectUri] } });
  expect(reg.status()).toBe(201);
  const { client_id } = await reg.json();

  // The browser session (logged in by the setup project) approves.
  const authUrl = new URL(as.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    scope: "soloos",
  }))
    authUrl.searchParams.set(k, v);
  await page.goto(authUrl.toString());
  await expect(page.getByText("Claude wants to read and update")).toBeVisible();
  const callback = page.waitForRequest((r) => r.url().startsWith(redirectUri));
  await page.route(`${redirectUri}**`, (route) => route.fulfill({ body: "ok" }));
  await page.getByRole("button", { name: "Allow" }).click();
  const cb = new URL((await callback).url());
  expect(cb.searchParams.get("state")).toBe("xyz");
  const code = cb.searchParams.get("code")!;

  const tokenRes = await request.post(as.token_endpoint, {
    form: { grant_type: "authorization_code", code, code_verifier: verifier, client_id, redirect_uri: redirectUri },
  });
  expect(tokenRes.status()).toBe(200);
  const { access_token } = await tokenRes.json();

  const headers = { authorization: `Bearer ${access_token}`, accept: "application/json, text/event-stream" };
  const call = await request.post("/api/mcp", {
    headers,
    data: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_projects", arguments: {} } },
  });
  expect(call.status()).toBe(200);
  const projects = JSON.parse((await call.json()).result.content[0].text);
  expect(Array.isArray(projects)).toBe(true);
});

test("consent page refuses an unregistered redirect URI", async ({ page, request }) => {
  const { client_id } = await (
    await request.post("/oauth/register", { data: { redirect_uris: [redirectUri] } })
  ).json();
  await page.goto(
    `/oauth/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent("https://evil.example/cb")}&code_challenge=${challenge}&code_challenge_method=S256`,
  );
  await expect(page.getByText("redirect_uri isn't registered for this client.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
});
