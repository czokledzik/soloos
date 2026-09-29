"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, checkPassword, createSession } from "@/server/session";

/** Only allow local paths, so `?next=` can't redirect off-site. */
const safeNext = (next: unknown) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";

export async function login(fd: FormData) {
  const next = safeNext(fd.get("next"));
  if (!checkPassword(String(fd.get("password") ?? ""))) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 1000));
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const session = createSession();
  (await cookies()).set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expires,
  });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
