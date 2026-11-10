// @vitest-environment node
/**
 * 油猴脚本导入重试策略测试。
 *
 * 脚本是单文件 userscript，无法直接 import，因此在 node:vm 里加载它，
 * 用假的 GM_* / DOM 桩驱动内部函数（脚本提供 window.__FENBI_TEST__ 钩子）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const scriptPath = path.resolve(
  process.cwd(),
  "scripts/fenbi-extractor.user.js",
);
const source = fs.readFileSync(scriptPath, "utf8");

type GmResponse = {
  status?: number;
  responseText?: string;
  /** 模拟网络层失败 / 超时，而不是 HTTP 响应 */
  failAs?: "error" | "timeout";
};

type Internals = {
  postWebhookWithRetry: (o: {
    url: string;
    token: string;
    body: string;
    key?: string;
    onRetry?: (next: number, max: number) => void;
  }) => Promise<{
    ok: boolean;
    duplicated?: boolean;
    attempts: number;
    result: { kind: string; status: number; body?: any };
  }>;
  backoffDelay: (attempt: number) => number;
  isRetryableStatus: (status: number) => boolean;
  RETRY: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
};

function loadScript(responses: GmResponse[]) {
  const storage = new Map<string, string>();
  const logs: any[] = [];
  let index = 0;

  const sandbox: any = {
    console: {
      log: () => {},
      info: (...args: any[]) => logs.push(args),
      error: () => {},
      warn: () => {},
    },
    setTimeout,
    clearTimeout,
    Math,
    Date,
    JSON,
    Promise,
    URL,
    String,
    Number,
    Object,
    Array,
    Map,
    Set,
    Error,
    isNaN,
    parseInt,
    parseFloat,
  };

  sandbox.window = {
    __FENBI_TEST__: true,
    addEventListener: () => {},
    location: { href: "https://tiku.fenbi.com/x" },
  };
  sandbox.location = sandbox.window.location;
  sandbox.document = {
    readyState: "loading",
    getElementById: () => null,
    createElement: () => ({
      style: {},
      appendChild: () => {},
      addEventListener: () => {},
      setAttribute: () => {},
    }),
    addEventListener: () => {},
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
  };
  class FakeXHR {
    _interceptedUrl = "";
    addEventListener() {}
    open() {}
    send() {}
    getAllResponseHeaders() {
      return "";
    }
  }
  sandbox.XMLHttpRequest = FakeXHR;
  sandbox.fetch = async () => ({ clone: () => ({ text: async () => "" }) });
  sandbox.Request = class {};

  sandbox.GM_getValue = (k: string, d: any) =>
    storage.has(k) ? storage.get(k) : d;
  sandbox.GM_setValue = (k: string, v: string) => storage.set(k, v);
  sandbox.GM_xmlhttpRequest = (opts: any) => {
    const spec = responses[Math.min(index, responses.length - 1)];
    index += 1;
    setTimeout(() => {
      if (spec.failAs === "error") {
        opts.onerror && opts.onerror({ error: "boom" });
      } else if (spec.failAs === "timeout") {
        opts.ontimeout && opts.ontimeout();
      } else {
        opts.onload &&
          opts.onload({
            status: spec.status ?? 200,
            responseText: spec.responseText ?? "",
          });
      }
    }, 0);
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(source, context, { filename: scriptPath });
  const internals = sandbox.window.__fenbiInternals as Internals;
  // 测试里把退避压到 1ms，避免真的等 1s/2s
  internals.RETRY.baseDelayMs = 1;
  internals.RETRY.maxDelayMs = 2;

  return { internals, logs, calls: () => index };
}

const okBody = JSON.stringify({ success: true, duplicated: false });

describe("粉笔脚本推送重试", () => {
  beforeEach(() => {
    /* 每个用例独立加载脚本，无共享状态 */
  });

  it("5xx 后成功：重试 1 次并成功", async () => {
    const { internals, logs } = loadScript([
      { status: 503, responseText: "upstream down" },
      { status: 200, responseText: okBody },
    ]);

    const res = await internals.postWebhookWithRetry({
      url: "http://x/api/import/fenbi-webhook",
      token: "t",
      body: "{}",
      key: "fenbi:abc",
    });

    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
    const events = logs.map((l) => JSON.parse(String(l[0]).replace("[fenbi-import] ", "")).event);
    expect(events).toContain("push-retry-scheduled");
    expect(events).toContain("push-succeeded");
  });

  it("4xx 不重试：直接失败，只请求 1 次", async () => {
    const { internals, logs } = loadScript([
      { status: 401, responseText: JSON.stringify({ success: false, message: "bad token" }) },
    ]);

    const res = await internals.postWebhookWithRetry({
      url: "http://x/api/import/fenbi-webhook",
      token: "t",
      body: "{}",
      key: "k",
    });

    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(1);
    const failed = logs
      .map((l) => JSON.parse(String(l[0]).replace("[fenbi-import] ", "")))
      .find((r) => r.event === "push-failed");
    expect(failed.retryable).toBe(false);
    expect(failed.status).toBe(401);
  });

  it("连续两次超时后成功：用满 3 次机会", async () => {
    const { internals } = loadScript([
      { failAs: "timeout" },
      { failAs: "timeout" },
      { status: 200, responseText: okBody },
    ]);

    const res = await internals.postWebhookWithRetry({
      url: "http://x",
      token: "t",
      body: "{}",
      key: "k",
    });

    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(3);
  });

  it("200 但 success=false（业务失败）不重试", async () => {
    const { internals } = loadScript([
      { status: 200, responseText: JSON.stringify({ success: false, message: "解析结果为空" }) },
    ]);

    const res = await internals.postWebhookWithRetry({
      url: "http://x",
      token: "t",
      body: "{}",
      key: "k",
    });

    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(1);
  });

  it("success=true 且 duplicated=true 视为成功并标记跳过", async () => {
    const { internals, logs } = loadScript([
      { status: 200, responseText: JSON.stringify({ success: true, duplicated: true }) },
    ]);

    const res = await internals.postWebhookWithRetry({
      url: "http://x",
      token: "t",
      body: "{}",
      key: "fenbi:dup",
    });

    expect(res.ok).toBe(true);
    expect(res.duplicated).toBe(true);
    const events = logs.map((l) => JSON.parse(String(l[0]).replace("[fenbi-import] ", "")).event);
    expect(events).toContain("push-skipped-duplicate");
  });

  it("3 次都失败时停止重试（不超过 maxAttempts）", async () => {
    const { internals } = loadScript([{ status: 500, responseText: "err" }]);

    const res = await internals.postWebhookWithRetry({
      url: "http://x",
      token: "t",
      body: "{}",
      key: "k",
    });

    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(3);
  });

  it("重试状态码判定：5xx/408/429/网络错误可重试，其余 4xx 不可重试", () => {
    const { internals } = loadScript([{ status: 200, responseText: okBody }]);
    expect(internals.isRetryableStatus(0)).toBe(true);
    expect(internals.isRetryableStatus(408)).toBe(true);
    expect(internals.isRetryableStatus(429)).toBe(true);
    expect(internals.isRetryableStatus(500)).toBe(true);
    expect(internals.isRetryableStatus(503)).toBe(true);
    expect(internals.isRetryableStatus(400)).toBe(false);
    expect(internals.isRetryableStatus(401)).toBe(false);
    expect(internals.isRetryableStatus(404)).toBe(false);
  });

  it("退避随尝试次数增长且带抖动", () => {
    const { internals } = loadScript([{ status: 200, responseText: okBody }]);
    internals.RETRY.baseDelayMs = 1000;
    internals.RETRY.maxDelayMs = 8000;

    const d1 = internals.backoffDelay(1);
    const d3 = internals.backoffDelay(3);
    const d10 = internals.backoffDelay(10);

    expect(d1).toBeGreaterThanOrEqual(800);
    expect(d1).toBeLessThanOrEqual(1200);
    expect(d3).toBeGreaterThanOrEqual(3200);
    expect(d3).toBeLessThanOrEqual(4800);
    // 超过上限后封顶 8s（±抖动）
    expect(d10).toBeLessThanOrEqual(9600);
    expect(d10).toBeGreaterThanOrEqual(6400);
  });

  it("结构化日志包含 key / attempt / 耗时", async () => {
    const { internals, logs } = loadScript([
      { status: 500, responseText: "x" },
      { status: 200, responseText: okBody },
    ]);

    await internals.postWebhookWithRetry({
      url: "http://x",
      token: "t",
      body: "{}",
      key: "fenbi:log-key",
    });

    const records = logs.map((l) =>
      JSON.parse(String(l[0]).replace("[fenbi-import] ", "")),
    );
    const attempt1 = records.find((r) => r.event === "push-attempt");
    expect(attempt1.key).toBe("fenbi:log-key");
    expect(attempt1.attempt).toBe(1);
    expect(typeof attempt1.elapsedMs).toBe("number");
    const scheduled = records.find((r) => r.event === "push-retry-scheduled");
    expect(typeof scheduled.retryInMs).toBe("number");
  });
});
