import type { NextConfig } from "next";

import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.E2E_TEST === 'true' ? '.next-e2e' : undefined,
  turbopack: {},
  experimental: {
    viewTransition: true,
  },
  /* config options here */
};

export default withSerwist(nextConfig);
