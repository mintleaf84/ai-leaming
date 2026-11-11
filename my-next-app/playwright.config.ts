import { defineConfig, devices } from "@playwright/test";
import _path from "path";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  /* Timeout for each test */
  timeout: 60 * 1000,
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  // CI 上失败重试 1 次即可：2 次会让失败用例把总时长放大三倍
  retries: process.env.CI ? 1 : 0,
  /* Opt out of parallel tests on CI. */
  // CI 用 2 个 worker 并行（webServer 单实例，SQLite 写少，2 个足够安全）
  workers: process.env.CI ? 2 : 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3001",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Capture screenshot on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // 生产服务：dev 模式下每个路由现编译，是 e2e 慢的主因
    // 先建库再构建：production build 的 "Collecting page data" 阶段会查询
    // feature flag 等表，空库会直接构建失败（首轮 CI 即此原因）。
    command: "npm run db:migrate && npm run build && npm run start -- -p 3001",
    url: "http://localhost:3001",
    // 必须让 Playwright 自己起服务：复用已在 3001 的普通 dev server 时
    // webServer.env（DB_FILENAME=test-e2e.db / E2E_TEST=true）不会生效，
    // 测试会打到真实库上。本地跑 e2e 前请先停掉占用 3001 的进程。
    reuseExistingServer: false,
    // 首次运行包含 production build，给足时间
    timeout: 420 * 1000,
    stdout: "pipe",
    env: {
      DB_FILENAME: "test-e2e.db",
      E2E_TEST: "true",
      SKIP_ENV_VALIDATION: "true",
      JWT_SECRET: "test-jwt-secret-for-e2e",
      AI_API_KEY: "test-api-key-for-e2e",
      // production build 在 NODE_ENV=production 下强制要求该变量
      BACKUP_ENCRYPTION_KEY: "test-backup-encryption-key-for-e2e",
    },
  },

  globalSetup: require.resolve("./tests/e2e/global-setup"),
});
