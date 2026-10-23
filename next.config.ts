import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native gRPC stack runs in the Node.js runtime and loads .proto files from disk.
  serverExternalPackages: ["@grpc/grpc-js", "@grpc/proto-loader"],
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
