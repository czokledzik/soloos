import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev badge off the sidebar's Settings link.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // CSV imports (Clockify/Linear exports) are uploaded through server actions.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
