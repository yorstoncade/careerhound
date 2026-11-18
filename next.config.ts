import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded at runtime from node_modules rather than bundled (Playwright drives a real browser).
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
