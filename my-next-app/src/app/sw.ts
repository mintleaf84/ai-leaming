import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry } from "@serwist/precaching";
import { installSerwist } from "@serwist/sw";
import {
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
} from "@serwist/strategies";
import { ExpirationPlugin } from "@serwist/expiration";

/// <reference lib="webworker" />

declare global {
  interface WorkerGlobalScope {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

installSerwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  /*
   * 离线兜底页（PWA 加载体验）
   *
   * 之前没有配 fallbacks：断网或弱网下 navigation 请求若没命中缓存，用户看到的是
   * 浏览器自带的错误页，而 `app/offline/page.tsx` 写了却从来没被用过。
   *
   * `fallbacks` 会在 SW 安装时把 `/offline` 自己预缓存（serwist 的 fallbacks()
   * 内部调用 precache(entries)），所以这里可以直接指向动态路由——不需要额外的
   * 静态 offline.html。`/offline` 不在 middleware 的 protectedRoutes 里，可匿名抓取。
   */
  fallbacks: {
    entries: [
      {
        url: "/offline",
        // 动态路由没有构建期 hash，revision 只能手写常量。
        // 改了 offline 页面的文案/结构时把这个值加一，SW 才会重新抓取它。
        revision: "offline-v1",
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
  runtimeCaching: [
    /*
     * 页面导航与 RSC 请求：NetworkFirst + 3 秒超时（docs/mobile-performance.md P0-4）
     *
     * 为什么必须显式写在最前面：`...defaultCache` 里对 HTML 文档与 `?_rsc=`
     * 用的也是 NetworkFirst，但**没有 networkTimeoutSeconds** —— 弱网下一次
     * 切页要等浏览器 fetch 自己失败（可达数十秒）才回落缓存，24 小时的缓存
     * 形同虚设。用户体感就是"点了底栏，页面愣住"。
     *
     * 3 秒是权衡：太短会在正常弱网（3G ≈ 1–2s TTFB）下频繁回退到旧页面，
     * 太长等于没加。回退后仍是上一次的页面骨架，比白屏好。
     */
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" ||
        request.headers.get("RSC") === "1" ||
        url.searchParams.has("_rsc"),
      handler: new NetworkFirst({
        cacheName: "document-cache",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 60 * 60 * 24, // 24 小时
          }),
        ],
      }),
    },
    // API 路由：NetworkFirst（优先网络，3 秒超时后降级到缓存）
    {
      matcher: /^https?:\/\/.*\/api\//,
      handler: new NetworkFirst({
        cacheName: "api-cache",
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 32,
            maxAgeSeconds: 60 * 5, // 5 分钟
          }),
        ],
      }),
    },
    // 静态字体与图标：CacheFirst（长期缓存）
    {
      matcher: /\.(woff2?|ttf|otf|eot)(\?.*)?$/,
      handler: new CacheFirst({
        cacheName: "font-cache",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 年
          }),
        ],
      }),
    },
    // 图片资源：StaleWhileRevalidate（快速显示，后台刷新）
    {
      matcher: /\.(png|jpg|jpeg|svg|gif|webp|ico)(\?.*)?$/,
      handler: new StaleWhileRevalidate({
        cacheName: "image-cache",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 64,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 天
          }),
        ],
      }),
    },
    // 其余资源使用 defaultCache 策略
    ...defaultCache,
  ],
});
