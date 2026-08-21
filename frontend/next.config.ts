import type { NextConfig } from "next";
import { securityHeaders } from "./lib/ops/security-headers";

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    useTypeScriptCli: false,
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders],
      },
    ];
  },
};

export default nextConfig;
