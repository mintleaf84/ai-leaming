import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "@serwist/precaching";
import { installSerwist } from "@serwist/sw";
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from "@serwist/strategies";
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
    runtimeCaching: [
        // API 路由：NetworkFirst（优先网络，离线降级到缓存）
        {
            matcher: /^https?:\/\/.*\/api\//,
            handler: new NetworkFirst({
                cacheName: "api-cache",
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
