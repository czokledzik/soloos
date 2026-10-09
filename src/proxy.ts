import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, appPassword, verifySession } from "@/server/session";

/** Endpoints that check their own credentials (MCP bearer tokens, OAuth, cron secret). */
const SELF_AUTHENTICATED = ["/api/mcp", "/api/cron/email-sync", "/oauth/register", "/oauth/token", "/.well-known/"];

export function proxy(request: NextRequest) {
  if (SELF_AUTHENTICATED.some((p) => request.nextUrl.pathname === p || (p.endsWith("/") && request.nextUrl.pathname.startsWith(p)))) {
    return NextResponse.next();
  }
  if (!appPassword()) {
    // Local dev runs without a password; a deployed app must never be open.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("APP_PASSWORD is not set. Add it to the environment variables and redeploy.", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (request.method !== "GET") return new NextResponse("Unauthorized", { status: 401 });
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
