import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  /*
   * 预缓存清单（PWA 加载速度）
   *
   * `@serwist/next` 的默认值是「public 下全部文件都进 precache」（glob 为双星通配），
   * 当前 public/ 共 986KB：icons 506KB + logo 251KB + data/keypoints.json 156KB
   * + fonts 62KB —— 首访时 SW 安装会把这批全部拉一遍，手机流量下与首屏抢带宽。
   *
   * 只保留「首屏与离线必需、且体积可接受」的两类：
   *   fonts/   next/font 生成的 woff2（62KB，缺了首屏字体要重排）
   *   icons/   PWA 安装与桌面图标（192 已重压到 17KB，512 保留原图）
   * logo.png（251KB，首屏图片）与 data/keypoints.json（156KB，点开知识点树才用）
   * 交给运行时缓存：图片走 StaleWhileRevalidate，JSON 走网络优先。
   */
  globPublicPatterns: ["fonts/**", "icons/**"],
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
