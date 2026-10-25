"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, PrinterIcon, SunIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

const noop = () => () => {};

/** Light/dark switch for the client portal (stored separately from the app's theme). */
export function PortalThemeToggle({ labels }: { labels: { toDark: string; toLight: string; dark: string; light: string } }) {
  const { resolvedTheme, setTheme } = useTheme();
  // The stored theme is only known in the browser; render the server's guess until hydrated.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={dark ? labels.toLight : labels.toDark}
      title={dark ? labels.light : labels.dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}

/**
 * Print view toolbar: opens the browser's print dialog ("Save as PDF") once every Mermaid
 * diagram has rendered, and offers a button to do it again. Hidden in the printout.
 */
export function PrintToolbar({ backHref, labels }: { backHref: string; labels: { hint: string; back: string; save: string } }) {
  useEffect(() => {
    // Browser tests run with navigator.webdriver set; a print dialog there would just get in the way.
    if (navigator.webdriver) return;
    let cancelled = false;
    const started = Date.now();
    const tick = async () => {
      if (cancelled) return;
      const pending = document.querySelectorAll("[data-diagram-loading]").length;
      if (pending > 0 && Date.now() - started < 15_000) return void setTimeout(tick, 200);
      await document.fonts.ready;
      if (!cancelled) window.print();
    };
    const t = setTimeout(tick, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm print:hidden">
      <span className="text-muted-foreground">{labels.hint}</span>
      <div className="flex gap-2">
        <a href={backHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {labels.back}
        </a>
        <Button size="sm" onClick={() => window.print()}>
          <PrinterIcon />
          {labels.save}
        </Button>
      </div>
    </div>
  );
}
