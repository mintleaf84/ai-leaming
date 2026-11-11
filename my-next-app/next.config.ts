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
    // E2E 用 `next start` 起生产服务（standalone 产物不支持 next start）
    output: process.env.E2E_TEST === "true" ? undefined : "standalone",
    distDir: process.env.E2E_TEST === "true" ? ".next-e2e" : undefined,
    turbopack: {},
    experimental: {
      // viewTransition 在 Next 16.4 的类型里已移除（且 src 未使用 ViewTransition），故去掉
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
