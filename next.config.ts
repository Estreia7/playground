import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dukascopy-node reaches for `prettier` at runtime to pretty-print validator
  // errors. It is an optional dependency it never actually needs here, but the
  // bundler cannot know that and fails the build trying to resolve it. Leaving
  // the package to Node's own require skips the bundling entirely, which is
  // what this option is for. It only ever runs on the server.
  // ws is the same story: its optional native speed-ups are not installed.
  serverExternalPackages: ["dukascopy-node", "ws"],

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
