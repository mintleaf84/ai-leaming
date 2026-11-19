// @vitest-environment node
/**
 * 契约守卫：`src/lib/contract/version.ts` 与服务端实际能力必须对得上。
 *
 * 这些是**静态门禁**，不是行为测试。它们拦的是三类"未来某天会出事"的改动：
 *
 * 1. `CONTRACT_VERSION` 被写成 0 / 负数 / 小数 —— 客户端做的是整数比较，
 *    非法值会让 `>=` 判断永远为假；
 * 2. `FEATURES` 里写了一个服务端根本没有的能力 —— 客户端探测到就放心去调，
 *    结果是 404。反过来（有路由却不在 FEATURES 里）只是少报，不致命，故不拦；
 * 3. 有人给 `/api/meta` 加上 `authMiddleware` —— 协商端点在登录前就要用，
 *    加了鉴权等于把旧客户端彻底锁死在门外。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { CONTRACT_VERSION, FEATURES } from "@/lib/contract/version";

const API_DIR = path.resolve(__dirname, "..");
const APP_SOURCE = fs.readFileSync(path.join(API_DIR, "app.ts"), "utf8");
const META_SOURCE = fs.readFileSync(
  path.join(API_DIR, "routes", "meta.ts"),
  "utf8",
);

/**
 * 挂在别的模块前缀下的子能力：能力名 ≠ 挂载前缀，但端点确实存在。
 * 新增条目时必须在这里说明所属模块，否则守卫会把它当成"凭空捏造的能力"。
 */
const SUB_CAPABILITIES: Record<string, string> = {
  "offline-answers": "/api/practice/offline-answers",
  "chat-sessions": "/api/chat/sessions",
};

describe("契约版本", () => {
  it("CONTRACT_VERSION 是 ≥ 1 的整数", () => {
    expect(Number.isInteger(CONTRACT_VERSION)).toBe(true);
    expect(CONTRACT_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("FEATURES 无重复且每项非空", () => {
    const live = FEATURES as readonly string[];
    expect(live.length).toBeGreaterThan(0);
    for (const feature of live) {
      expect(feature.trim().length).toBeGreaterThan(0);
      expect(feature).toMatch(/^[a-z0-9-]+$/);
    }
    expect(new Set(live).size).toBe(live.length);
  });

  it("FEATURES 里的每个能力都能在 app.ts 找到同名挂载前缀（子能力走白名单）", () => {
    const missing: string[] = [];

    for (const feature of FEATURES as readonly string[]) {
      const sub = SUB_CAPABILITIES[feature];
      if (sub) {
        // 白名单也要真的对得上：所属模块的前缀必须存在
        const owner = sub.split("/")[2];
        if (!APP_SOURCE.includes(`app.route("/${owner}"`)) {
          missing.push(`${feature}（子能力所属模块 /${owner} 未挂载）`);
        }
        continue;
      }

      if (!APP_SOURCE.includes(`app.route("/${feature}"`)) {
        missing.push(feature);
      }
    }

    expect(
      missing,
      "FEATURES 里声明了服务端没有的能力（客户端会探测到就去调，然后 404）。要么在 app.ts 挂上对应路由，要么从 FEATURES 删除",
    ).toEqual([]);
  });
});

/** 去掉注释再判断：文件头的注释里会提到 authMiddleware 作为反面提醒，不算实现。 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("/api/meta 必须保持公开", () => {
  it("路由定义里没有 authMiddleware", () => {
    const code = stripComments(META_SOURCE);
    expect(
      code.includes("authMiddleware"),
      "契约协商端点被加了鉴权：老客户端在登录前就要调它，加上 authMiddleware 会把升级路径锁死",
    ).toBe(false);
  });

  it("app.ts 仍然挂载在 /meta", () => {
    expect(APP_SOURCE).toContain('app.route("/meta"');
  });
});
