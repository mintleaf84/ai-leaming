/**
 * REST 分页参数的唯一解析入口。
 *
 * 为什么收成一处：四条路由各写了一遍，且行为不一致 ——
 * - `external.ts` 夹到 1..100（并给出默认值）；
 * - `knowledge.ts` / `questions.ts` 直接 `parseInt`（`?limit=abc` → NaN →
 *   底层 SQL 的 LIMIT 收到 NaN，行为取决于驱动，通常是"返回全表"或报错）；
 * - `wrong-book.ts` 只夹上限 50、不夹下限（`?count=0` / 负数直接下沉到 SQL）。
 *
 * 统一后：非数字/0/负数一律回落到默认值，超过 [maxLimit] 截断，
 * 并且**永远返回整数**，调用方不必再判 NaN。
 */

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface PaginationOptions {
  /** 不传 limit 或 limit 非法时的默认值（默认 20） */
  defaultLimit?: number;
  /** 单页上限（默认 100；题库随机抽题等场景传 50） */
  maxLimit?: number;
}

export interface Pagination {
  limit: number;
  offset: number;
}

/**
 * 严格整数解析：`Number.parseInt("12oops")` 会得到 12（静默忽略尾巴），
 * 那等于把非法参数当成有效分页值。这里要求整串就是一个整数。
 */
function toInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : fallback;
}

/**
 * 解析 `limit` / `offset`。
 *
 * - `limit`：非法或 <1 → `defaultLimit`；> `maxLimit` → `maxLimit`
 * - `offset`：非法或 <0 → 0
 */
export function parsePagination(
  query: { limit?: string | null; offset?: string | null },
  options: PaginationOptions = {},
): Pagination {
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = options.maxLimit ?? MAX_LIMIT;

  // 非正整数一律回落到默认值（`limit=0` 应当拿到默认的 20，而不是 1）
  const rawLimit = toInt(query.limit ?? undefined, defaultLimit);
  const limit = rawLimit < 1 ? defaultLimit : Math.min(maxLimit, rawLimit);

  const rawOffset = toInt(query.offset ?? undefined, 0);
  const offset = Math.max(0, rawOffset);

  return { limit, offset };
}
