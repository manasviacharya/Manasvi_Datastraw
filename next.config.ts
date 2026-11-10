import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Render builds with the repo lockfile; keep output traceable and small.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
