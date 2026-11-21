import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los comprobantes pueden pesar hasta 5 MB; el valor por defecto (1 MB) los cortaría.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
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
