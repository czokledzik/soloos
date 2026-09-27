"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export function Sidebar() {
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
    </aside>
  );
}
