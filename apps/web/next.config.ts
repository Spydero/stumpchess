import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@chess/shared", "@chess/db"],
  serverExternalPackages: ["@prisma/client", "prisma"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@chess/shared": path.resolve(__dirname, "../../packages/shared/src"),
    };
    return config;
  },
};

export default nextConfig;
