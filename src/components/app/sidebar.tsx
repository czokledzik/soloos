"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOutIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { logout } from "@/app/login/actions";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export function Sidebar({ canLogout = false }: { canLogout?: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-4 text-sm font-semibold tracking-tight">SoloOS</div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
        className="mx-2 mb-2 flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="text-xs">⌘K</kbd>
      </button>
      <nav className="grid gap-0.5 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mx-2 mt-auto mb-3 flex items-center gap-1">
        <Link
          href="/settings"
          className={cn(
            "flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
            pathname.startsWith("/settings")
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
          )}
        >
          <SettingsIcon className="size-4" />
          Settings
        </Link>
        {canLogout && (
          <form action={logout}>
            <button
              type="submit"
              title="Log out"
              className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <LogOutIcon className="size-4" />
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}
