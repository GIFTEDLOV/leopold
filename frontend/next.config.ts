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
  async redirects() {
    return [
      { source: "/app/v2", destination: "/app", permanent: false },
      { source: "/app/prize-savings", destination: "/app", permanent: false },
    ];
  },
};

export default nextConfig;
