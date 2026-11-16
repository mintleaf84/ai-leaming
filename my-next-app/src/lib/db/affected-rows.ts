/**
 * 从驱动的执行结果里取「受影响行数」。
 *
 * 为什么需要它：drizzle 的 `delete`/`run` 返回值在不同驱动下形状不同
 * （better-sqlite3 是 `{ rowsAffected }`，部分路径是 `{ changes }`），
 * 业务代码里此前是就地断言：`(result as unknown as { rowsAffected: number })`。
 *
 * **必须区分「0」与「取不到」**：`rowsAffected || fallback` 会把 0 当成缺失，
 * 于是「一行都没删掉」被报成「全删了」（`admin-service.batchDeleteQuestions`
 * 原本就是这个写法）。返回值用 `null` 表示取不到，调用方自己决定兜底。
 */
export function affectedRows(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const candidate = result as { rowsAffected?: unknown; changes?: unknown };
  const value = candidate.rowsAffected ?? candidate.changes;
  return typeof value === "number" ? value : null;
}
