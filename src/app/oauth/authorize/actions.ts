"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { issueCode } from "@/server/mcp/oauth";
import { SESSION_COOKIE, verifySession } from "@/server/session";
import { checkRequest } from "./check";

export async function decide(fd: FormData) {
  if (!verifySession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login");
  const sp = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const check = checkRequest(sp);
  if ("error" in check) throw new Error(check.error);

  const target = new URL(sp.redirect_uri);
  if (sp.state) target.searchParams.set("state", sp.state);
  if (sp.decision !== "allow") {
    target.searchParams.set("error", "access_denied");
  } else {
    target.searchParams.set(
      "code",
      issueCode({ clientId: sp.client_id, redirectUri: sp.redirect_uri, codeChallenge: sp.code_challenge, scope: sp.scope }),
    );
  }
  redirect(target.toString());
}
