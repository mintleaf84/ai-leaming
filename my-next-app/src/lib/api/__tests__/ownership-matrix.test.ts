// @vitest-environment node
/**
 * 归属矩阵门禁。
 *
 * ## 为什么需要它
 *
 * 2026-11 的 `pdf-import` 越权（IDOR）不是写错了什么，而是**没有人被要求想过**
 * 「这个端点拿到 taskId 之后，凭什么确认它属于当前用户」。评审靠运气发现它，
 * 而同类问题在 18 个路由模块里还有多少，没人知道。
 *
 * 这道门禁把「想过没有」变成可执行的检查：
 *
 * 1. 每个路由模块必须在 `MODULES` 里登记归属语义（user / admin / global / public）；
 * 2. 标成 `user` 的模块必须指向**一个真实的跨用户测试文件**，且该文件里
 *    确实写了跨用户断言（否则就是挂了个空指针）；
 * 3. 标成 `global` 的必须写一句理由（为什么全局共享不是越权）；
 * 4. 外部 API 的写路由必须显式声明 `write` 作用域 —— 漏一个，只读 key 就能改数据。
 *
 * 它是静态门禁，不是行为测试：真正的跨用户行为由各模块自己的用例覆盖（第 2 条
 * 强制它们存在）。这样新加模块时会被拦下来"想一遍"，而不是等到出事再复盘。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROUTES_DIR = path.resolve(__dirname, "..", "routes");

type ModuleScope = "user" | "admin" | "global" | "public";

interface ModuleRule {
  /** 挂载前缀（main route 里的 `app.route("<mount>", xRoute)`） */
  mount: string;
  scope: ModuleScope;
  /** scope=user 可选：覆盖该模块跨用户行为的测试文件（相对 my-next-app 根） */
  crossUserTest?: string;
  /** scope=global 必填：为什么全局共享不是越权 */
  reason?: string;
}

/**
 * 尚未补跨用户测试的用户私有模块（**只许减，不许增**）。
 *
 * 2026-11 复核：chat / feedback / generate / knowledge / mastery / profile / stats
 * 七条全部补齐（见各条目的 `crossUserTest`），本清单已清空。
 * 将来新增用户私有模块时：要么直接补跨用户测试，要么写进这里并说明拿什么 id 定位资源。
 */
const KNOWN_UNCOVERED: Record<string, string> = {};

/** 每个路由模块的归属语义。新增模块时必须在这里登记，否则测试失败。 */
const MODULES: Record<string, ModuleRule> = {
  // ---- 用户私有数据 ----
  annotations: {
    mount: "/api/annotations",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/annotations-ownership.test.ts",
  },
  chat: {
    mount: "/api/chat",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/chat-ownership.test.ts",
  },
  external: {
    mount: "/api/external",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/external-recall.test.ts",
  },
  feedback: {
    mount: "/api/feedback",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/feedback-ownership.test.ts",
  },
  generate: {
    mount: "/api/generate",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/generate-ownership.test.ts",
  },
  history: {
    mount: "/api/history",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/history-ownership.test.ts",
  },
  knowledge: {
    mount: "/api/knowledge",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/knowledge-ownership.test.ts",
  },
  mastery: {
    mount: "/api/mastery",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/mastery-ownership.test.ts",
  },
  "pdf-import": {
    mount: "/api/pdf-import",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/pdf-import-ownership.test.ts",
  },
  practice: {
    mount: "/api/practice",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/practice-ownership.test.ts",
  },
  // 回忆卡的复习进度/日志按用户隔离（卡组内容全局共享，但不是越权面）；
  // 跨用户断言见测试文件里的「用户隔离」段：另一个用户读同一 cardId 必须 state=null。
  recall: {
    mount: "/api/recall",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/recall-jwt.test.ts",
  },
  profile: {
    mount: "/api/profile",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/profile-ownership.test.ts",
  },
  stats: {
    mount: "/api/stats",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/stats-ownership.test.ts",
  },
  "wrong-book": {
    mount: "/api/wrong-book",
    scope: "user",
    crossUserTest: "src/lib/api/routes/__tests__/wrong-book-ownership.test.ts",
  },

  // ---- 管理端 ----
  admin: { mount: "/api/admin", scope: "admin" },

  // ---- 全局共享内容（谁都能读/写题库；不含个人数据） ----
  import: {
    mount: "/api/import",
    scope: "global",
    reason: "题库是全局共享内容（questions 表无 user_id），导入直接写共享题库",
  },
  questions: {
    mount: "/api/questions",
    scope: "global",
    reason: "题库全局共享，读接口不含个人数据",
  },
  billing: {
    mount: "/api/billing",
    scope: "global",
    reason:
      "套餐目录是产品级静态配置（subscription_plans 无 user_id），所有登录用户看到同一份价格表；用户自己的订阅在 user_subscriptions，不由本模块读写",
  },
  textbook: {
    mount: "/api/textbook",
    scope: "global",
    reason: "教材内容是全局共享静态资源，不含个人数据",
  },

  // ---- 公开（无需登录） ----
  auth: { mount: "/api/auth", scope: "public" },
  // 前端性能指标上报（docs/performance.md T-01）：匿名、只写不读，
  // 入参固定为 name/value/route/rating，不含任何可以定位到"谁的数据"的标识符，
  // 因此没有越权面，也不需要跨用户测试。
  vitals: { mount: "/api/vitals", scope: "public" },
};

function moduleFiles(): string[] {
  return fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

describe("归属矩阵：每个路由模块都要被归类", () => {
  it("没有未登记的模块（新增路由必须想一遍归属）", () => {
    const files = moduleFiles();
    const unregistered = files.filter((name) => !(name in MODULES));
    expect(
      unregistered,
      `以下路由模块没有登记归属语义。请在 MODULES 里补一条：user（用户私有，必须给出跨用户测试）/ admin / global（全局共享，必须写理由）/ public`,
    ).toEqual([]);
  });

  it("没有过期的登记（模块已删但表里还留着）", () => {
    const files = new Set(moduleFiles());
    const stale = Object.keys(MODULES).filter((name) => !files.has(name));
    expect(stale, "MODULES 里登记了不存在的模块，删掉它").toEqual([]);
  });

  it("scope=user 的模块要么有跨用户测试，要么在已知欠账清单里（只许减）", () => {
    const unaccounted: string[] = [];
    for (const [name, rule] of Object.entries(MODULES)) {
      if (rule.scope !== "user") continue;
      if (rule.crossUserTest) {
        const abs = path.resolve(__dirname, "../../../..", rule.crossUserTest);
        if (!fs.existsSync(abs)) {
          unaccounted.push(`${name}: 测试文件不存在 ${rule.crossUserTest}`);
        }
        continue;
      }
      if (!(name in KNOWN_UNCOVERED)) {
        unaccounted.push(`${name}: 既没有跨用户测试，也没进 KNOWN_UNCOVERED`);
      }
    }
    expect(
      unaccounted,
      "新增用户私有模块时：要么补跨用户测试，要么写进 KNOWN_UNCOVERED 并说明拿什么 id 定位资源",
    ).toEqual([]);
  });

  it("已知欠账只许减：清单里的条目必须仍是未覆盖状态", () => {
    const notUserModule = Object.keys(KNOWN_UNCOVERED).filter(
      (name) => MODULES[name]?.scope !== "user",
    );
    const coveredButStillListed = Object.keys(KNOWN_UNCOVERED).filter(
      (name) => MODULES[name]?.crossUserTest,
    );
    expect(
      notUserModule.concat(coveredButStillListed),
      "补完测试后请把它从欠账清单里删掉",
    ).toEqual([]);
  });

  it("跨用户测试文件里必须真的写了跨用户断言（不能只挂个空文件）", () => {
    const weak: string[] = [];
    for (const [name, rule] of Object.entries(MODULES)) {
      if (rule.scope !== "user" || !rule.crossUserTest) continue;
      const abs = path.resolve(__dirname, "../../../..", rule.crossUserTest);
      if (!fs.existsSync(abs)) continue; // 上一条用例负责报错
      const content = fs.readFileSync(abs, "utf8");
      // 至少要有「他人 / 跨用户 / 另一个用户」这类语义锚点，否则这个文件
      // 很可能只是普通功能测试，被拿来当挡箭牌
      const hasCrossUserWording =
        /他人|跨用户|另一个用户|另一个身份|user ?B|other user/i.test(content);
      if (!hasCrossUserWording) weak.push(`${name}: ${rule.crossUserTest}`);
    }
    expect(
      weak,
      "这些文件被登记为跨用户测试，但内容里找不到跨用户语义（他人/跨用户/另一个用户）",
    ).toEqual([]);
  });

  it("scope=global 的模块必须写清理由", () => {
    const missing = Object.entries(MODULES)
      .filter(([, r]) => r.scope === "global" && (r.reason ?? "").length < 10)
      .map(([name]) => name);
    expect(missing, "全局共享的模块必须写一句「为什么不是越权」").toEqual([]);
  });

  it("挂载前缀不重复", () => {
    const mounts = Object.values(MODULES).map((r) => r.mount);
    expect(new Set(mounts).size).toBe(mounts.length);
  });
});

describe("外部 API：写路由必须声明 write 作用域", () => {
  const source = fs.readFileSync(path.join(ROUTES_DIR, "external.ts"), "utf8");

  /**
   * 粗粒度切分 `createRoute({ ... })` 块：从 `createRoute({` 到下一个
   * `});` 为止。够用且不会误伤（本文件里没有嵌套同名调用）。
   */
  function routeBlocks(): string[] {
    const blocks: string[] = [];
    let i = 0;
    while ((i = source.indexOf("createRoute({", i)) !== -1) {
      const end = source.indexOf("\n});", i);
      blocks.push(source.slice(i, end === -1 ? undefined : end));
      i += 1;
    }
    return blocks;
  }

  it("每个 POST/DELETE/PATCH 都声明了写作用域（write 或更强的 admin）", () => {
    // admin ⊃ write：题库是全局资产，建/改题要 admin，这比 write 更严；
    // 断言的是"不能被 read 作用域改数据"，所以两种都算合规
    const missing: string[] = [];
    for (const block of routeBlocks()) {
      const method = /method:\s*"([a-z]+)"/.exec(block)?.[1];
      const routePath = /path:\s*"([^"]+)"/.exec(block)?.[1];
      if (!method || !routePath) continue;
      if (!["post", "delete", "patch", "put"].includes(method)) continue;
      // 只看 `middleware: [...]` 这一段：注释里出现 admin/write 字样不算数
      // （否则把 PATCH 降级成 write、只在注释里留一句 admin 也能骗过门禁）
      const middleware = /middleware:\s*\[([^\]]*)\]/.exec(block)?.[1] ?? "";
      if (!/requireScopeMiddleware\("(write|admin)"\)/.test(middleware)) {
        missing.push(`${method.toUpperCase()} ${routePath}`);
      }
    }
    expect(
      missing,
      "写路由没声明 write/admin 作用域 = 只读 key 也能改数据（作用域提升）",
    ).toEqual([]);
  });

  it("admin 作用域的写路由只出现在题库写接口（别把普通写逻辑升级成 admin）", () => {
    const adminOnly: string[] = [];
    for (const block of routeBlocks()) {
      const method = /method:\s*"([a-z]+)"/.exec(block)?.[1];
      const routePath = /path:\s*"([^"]+)"/.exec(block)?.[1];
      if (!method || !routePath) continue;
      const middleware = /middleware:\s*\[([^\]]*)\]/.exec(block)?.[1] ?? "";
      if (/requireScopeMiddleware\("admin"\)/.test(middleware)) {
        adminOnly.push(`${method.toUpperCase()} ${routePath}`);
      }
    }
    expect(adminOnly.sort()).toEqual([
      "PATCH /questions/{id}",
      "POST /questions",
    ]);
  });

  it("GET 路由不得挂 write 作用域（避免把读权限误提升）", () => {
    const wrong: string[] = [];
    for (const block of routeBlocks()) {
      const method = /method:\s*"([a-z]+)"/.exec(block)?.[1];
      const routePath = /path:\s*"([^"]+)"/.exec(block)?.[1];
      if (method !== "get") continue;
      if (block.includes('requireScopeMiddleware("write")')) {
        wrong.push(`GET ${routePath}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("解析到的路由块数量合理（防止解析失效导致空跑通过）", () => {
    // 当前 18 条；放宽下限是为了加接口不用改测试，但低于这个数说明解析坏了
    expect(routeBlocks().length).toBeGreaterThanOrEqual(15);
  });
});
