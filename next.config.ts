import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E tests build into their own directory so they don't clash with `pnpm dev`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Keep the dev badge off the sidebar's Settings link.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // CSV imports (Clockify/Linear exports) are uploaded through server actions.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
