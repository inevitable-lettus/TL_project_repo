import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Host-machine `next dev` only: reach the composed backend through nginx.
    // In production the frontend container sits behind nginx, which owns /api.
    return process.env.NODE_ENV === "development"
      ? [{ source: "/api/:path*", destination: "http://localhost/api/:path*" }]
      : [];
  },
};

export default nextConfig;
