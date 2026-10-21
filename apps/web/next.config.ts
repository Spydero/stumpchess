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
  /**
   * Needed for multi-threaded Stockfish WASM (SharedArrayBuffer).
   * credentialless keeps cross-origin API/socket loads working.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
      {
        source: "/engines/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
