/**
 * 库文件位置的**唯一解析入口**。
 *
 * 为什么必须只有一个入口：连接（`initDatabase` / `reinitDb`）、备份快照名、
 * 恢复目标路径如果各自拼路径，改了 `DB_FILENAME` 的部署就会出现「连的是 A 库、
 * 恢复写的是 B 库」——恢复报成功，应用却在空库上跑。
 *
 * 路径形式固定为 `<cwd>/data/<DB_FILENAME>`，与历史布局一致；`process.cwd()`
 * 在调用时解析（测试会用 `vi.spyOn(process, "cwd")` 换工作目录）。
 */
import path from "path";
import Database from "better-sqlite3";
import { env } from "@/env";

/** 与 `env.ts` 的默认值一致；这里只是防 env 校验被跳过（SKIP_ENV_VALIDATION）时的兜底 */
export const DEFAULT_DB_FILENAME = "ai-learning.db";

export function resolveDbFilePath(): string {
  return path.resolve(
    process.cwd(),
    "data",
    env.DB_FILENAME || DEFAULT_DB_FILENAME,
  );
}

/**
 * 恢复备份时必须存在的核心表。
 *
 * 判据是「应用的读写路径离了它就跑不起来」：没有 `questions` / `practice_logs`
 * 就没有刷题与统计，没有 `users` 就没有鉴权，没有 `system_settings` 配置全丢。
 * 只靠 16 字节 magic header 校验是不够的 —— 任何别的 SQLite 库都能通过，
 * 一旦被接受就会覆盖线上库，表现为「恢复成功但应用空转」。
 */
export const CORE_DB_TABLES = [
  "users",
  "questions",
  "practice_logs",
  "system_settings",
] as const;

/**
 * 检查某个 SQLite 文件里缺哪些核心表；返回空数组表示结构看起来是本应用的库。
 *
 * 只读打开，不会修改文件。文件不是合法 SQLite 时由 `better-sqlite3` 抛出，
 * 调用方按「无效备份」处理（这是可枚举的业务错误，不需要再包一层）。
 */
export function findMissingCoreTables(filePath: string): string[] {
  const probe = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const rows = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const present = new Set(rows.map((row) => row.name));
    return CORE_DB_TABLES.filter((table) => !present.has(table));
  } finally {
    probe.close();
  }
}
