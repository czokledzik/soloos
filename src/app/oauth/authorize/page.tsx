import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { decide } from "./actions";
import { checkRequest, one } from "./check";

export const metadata: Metadata = { title: "Connect to SoloOS" };

// The proxy already sent us through /login, so reaching this page means the user is signed in.
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const sp = await searchParams;
  const check = checkRequest(sp);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="grid w-full max-w-sm gap-4">
        <h1 className="text-lg font-semibold tracking-tight">Connect to SoloOS</h1>
        {"error" in check ? (
          <p className="text-sm text-destructive">{check.error}</p>
        ) : (
          <form action={decide} className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              <b className="text-foreground">{check.client.client_name || "An app"}</b> wants to read and update your SoloOS
              data: clients, projects, messages and docs. It can add decisions, tasks, change requests and messages, but
              can&apos;t delete anything.
            </p>
            {["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"].map((k) => (
              <input key={k} type="hidden" name={k} value={one(sp[k])} />
            ))}
            <div className="flex gap-2">
              <Button type="submit" name="decision" value="allow">
                Allow
              </Button>
              <Button type="submit" name="decision" value="deny" variant="outline">
                Deny
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Redirects back to {new URL(one(sp.redirect_uri)).host}. Changing APP_PASSWORD disconnects every app.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
