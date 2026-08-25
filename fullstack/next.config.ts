import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker uses the self-contained traced server. Vercel supplies its own
  // serverless output pipeline, and standalone output prevents its build
  // analyzer from finding the expected next-server trace manifest.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
