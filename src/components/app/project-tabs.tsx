"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProjectTabs({ projectId }: { projectId: number }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: "Tasks" },
    { href: `${base}/time`, label: "Time" },
    { href: `${base}/payments`, label: "Payments" },
    { href: `${base}/overview`, label: "Overview" },
    { href: `${base}/scope`, label: "Scope" },
    { href: `${base}/docs`, label: "Docs" },
  ];
  return (
    <nav className="flex gap-4 border-b px-6 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 py-2",
            pathname === t.href
              ? "border-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
