"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";

/**
 * The app follows the system theme. The client portal (/p/…) is light by default with its own
 * stored choice, so a client toggling it doesn't change the app's theme; its print view is always light.
 * (next-themes ignores nested providers, so the switch happens here.)
 */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/p/")) {
    return (
      <ThemeProvider
        attribute="class"
        storageKey="portal-theme"
        defaultTheme="light"
        enableSystem={false}
        forcedTheme={pathname.endsWith("/print") ? "light" : undefined}
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
