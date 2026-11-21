import { defineConfig, type ViteUserConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// 显式标注类型：defineConfig 的重载在"plugins + coverage"同时出现时会退化到
// vite 的 overload，报一句与真实原因无关的错（coverage 不存在于 ViteUserConfigExport）。
const config: ViteUserConfig = {
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    testTimeout: 15000,
    // 真实 SQLite 的 beforeAll 要跑迁移 + 播种：并行跑全量时 10s 默认值会偶发超时
    hookTimeout: 30000,
    setupFiles: ["./tests/setup.ts"],
    // 排除 e2e 测试
    exclude: [
      "**/node_modules/**",
      "**/e2e/**",
      "**/playwright/**",
      // 布局护栏依赖真实浏览器（Playwright 运行），jsdom 下无意义
      "**/visual/**",
    ],
    coverage: {
      provider: "v8",
      // 只出三类：CI 里贴日记得看 summary，json-summary 给脚本/门禁读，
      // lcov 给失败时上传产物做归因（html 本地要看时用 --coverage.reporter=html 临时开）。
      reporter: ["text-summary", "json-summary", "lcov"],
      // 阈值口径：**实测值 −1pp 的棘轮**（2026-11-20 实测全局 72.40% 行覆盖）。
      // 只卡 lines：branches 受 mock 分支影响波动大，卡死会逼人写无意义断言；
      // 按目录分档是为了防止"服务层覆盖好"把"页面层覆盖差"平均掉。
      // 提升覆盖后请手动上调对应数字（不做 autoUpdate，避免 CI 偷偷改阈值）。
      thresholds: {
        lines: 71.4,
        "src/lib/services/**": { lines: 83.09 },
        "src/lib/api/**": { lines: 79.68 },
        "src/lib/auth/**": { lines: 79.39 },
        "src/lib/db/**": { lines: 78.79 },
        "src/app/**": { lines: 57.87 },
        "src/components/**": { lines: 66.97 },
      },
    },
  },
  resolve: {
    alias: {
      // 在测试环境中，将 server-only 映射到空模块存根
      "server-only": new URL("./__mocks__/server-only.js", import.meta.url)
        .pathname,
    },
  },
};

export default defineConfig(config);
