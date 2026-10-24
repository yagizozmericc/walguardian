import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native gRPC stack runs in the Node.js runtime and loads .proto files from disk.
  serverExternalPackages: ["@grpc/grpc-js", "@grpc/proto-loader"],
  // `/` is now the marketing page; shareable `/?address=0x…` links still open the dashboard.
  async redirects() {
    return [{ source: "/", has: [{ type: "query", key: "address" }], destination: "/dashboard", permanent: false }];
  },
  outputFileTracingIncludes: {
    "/api/**": ["./proto/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
