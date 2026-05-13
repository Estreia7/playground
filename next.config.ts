import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/airbnb/:path*",
        destination: "http://127.0.0.1:4001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
