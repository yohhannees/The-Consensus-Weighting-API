import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lean, self-contained production output for the Dockerfile  -  bundles only
  // the traced dependencies instead of shipping the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
