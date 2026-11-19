import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * W1.1 防复发门禁：`src/app/**` 下禁止直接 `useQuery`。
 *
 * 事故背景：查询点普遍不判断 `isError`，接口 500 时页面把"加载失败"渲染成
 * "暂无数据"（用户以为数据没了，而不是服务挂了）。只靠 review 记不住这条，
 * 所以用静态扫描钉死：新代码只能用 `@/hooks/useAppQuery`，它把
 * loading → error → empty → data 的四态语义固定住。
 *
 * 与 Flutter 侧 `navigation_rules_test.dart` 同思路：不跑浏览器、不碰渲染，
 * 只读源码文本。扫描范围是 `src/app`（页面与页面级 hook）；`src/components`
 * 里两个组件（AnnotatableText / KeypointTree）同样已迁移，但展示层组件不在
 * 本门禁范围内。
 *
 * allowlist 只减不增：条目一旦被迁移掉，用例会因"陈旧条目"失败，强制把
 * 白名单删掉。
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const APP_DIR = path.join(SRC, "app");
const TANSTACK_IMPORT = /from\s+["']@tanstack\/react-query["']/;
const USE_QUERY_IMPORT =
  /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@tanstack\/react-query["']/;

/**
 * 尚未迁移、且**已显式处理 isError** 的调用点。
 * 当前为空：全部已迁移到 useAppQuery。新增条目等于承认"这里允许裸 useQuery"，
 * 必须在 PR 描述里写清为什么不迁移。
 */
const useQueryAllowlist: string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walk(full, out);
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function rel(file: string) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function importsUseQuery(source: string): boolean {
  if (!TANSTACK_IMPORT.test(source)) return false;
  const match = source.match(USE_QUERY_IMPORT);
  if (!match) return false;
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^type\s+/, ""))
    .some((name) => name === "useQuery");
}

describe("W1.1 查询门禁：app/** 只能通过 useAppQuery 发起查询", () => {
  const files = walk(APP_DIR);

  it("扫描到了源码（防止 walk 静默返回空列表导致门禁失效）", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("没有任何文件从 @tanstack/react-query 直接 import useQuery", () => {
    const violations = files.filter((file) =>
      importsUseQuery(fs.readFileSync(file, "utf8")),
    );

    const unexpected = violations
      .map(rel)
      .filter((f) => !useQueryAllowlist.includes(f));
    expect(
      unexpected,
      `以下文件绕过了 useAppQuery 门禁（改用 @/hooks/useAppQuery）：\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });

  it("allowlist 里没有陈旧条目（迁移后必须划掉）", () => {
    const stale = useQueryAllowlist.filter((allowed) => {
      const abs = path.join(ROOT, allowed);
      if (!fs.existsSync(abs)) return true;
      return !importsUseQuery(fs.readFileSync(abs, "utf8"));
    });

    expect(
      stale,
      `以下条目已不再直接使用 useQuery，请从 useQueryAllowlist 中删除：\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  it("useAppQuery 仍是唯一入口（导出存在且带 retry）", () => {
    const hookFile = path.join(SRC, "hooks", "useAppQuery.ts");
    expect(fs.existsSync(hookFile)).toBe(true);
    const source = fs.readFileSync(hookFile, "utf8");
    expect(source).toContain("export function useAppQuery");
    expect(source).toContain("retry");
  });
});
