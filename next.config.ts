import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingIncludes: {
    "/*": ["./migrations/**/*.sql", "./src/content/**/*.md"],
  },
};

export default nextConfig;
