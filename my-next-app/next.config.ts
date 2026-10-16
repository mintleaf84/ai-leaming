import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default (phase: string) => {
  const isBuilding = phase === PHASE_PRODUCTION_BUILD;

  const nextConfig: NextConfig = {
    output: "standalone",
    distDir: process.env.E2E_TEST === "true" ? ".next-e2e" : undefined,
    turbopack: {},
    experimental: {
      viewTransition: true,
      serverActions: {
        bodySizeLimit: "70mb",
      },
    },
    env: {
      IS_BUILDING: isBuilding ? "true" : "false",
    },
  };

  return withSerwist(nextConfig);
};
