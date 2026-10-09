import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E tests build into their own directory so they don't clash with `pnpm dev`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Keep the dev badge off the sidebar's Settings link.
  devIndicators: { position: "bottom-right" },
  // Nothing here is meant to be embedded; in particular the OAuth consent page
  // must not be framed (clickjacking the "Allow" button).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  experimental: {
    // CSV imports (Clockify/Linear exports) are uploaded through server actions.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
