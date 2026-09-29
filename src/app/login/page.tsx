import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "./actions";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <form action={login} className="grid w-full max-w-xs gap-3">
        <h1 className="text-lg font-semibold tracking-tight">SoloOS</h1>
        <input type="hidden" name="next" value={typeof next === "string" ? next : "/"} />
        <Input
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          aria-label="Password"
          autoFocus
          required
        />
        {error && <p className="text-sm text-destructive">Wrong password.</p>}
        <Button type="submit">Log in</Button>
      </form>
    </div>
  );
}
