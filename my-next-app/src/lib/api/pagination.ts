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
 *
 * ## 为什么有两个入口（`parsePagination` / `parsePageParams`）
 *
 * 两套参数名是**两套对外契约**，不能合并：
 * - `parsePagination` 收 `limit`/`offset`（`external.ts` 等对外只读接口，
 *   `src/lib/api/routes/external.ts` 的文档与客户端已按此固定）；
 * - `parsePageParams` 收 `page`/`pageSize`（`history.ts`）与 `page`/`limit`
 *   （`questions.ts`），页码语义由路由转成 offset。
 *
 * 把页码路由改成 `parsePagination` 会**改掉 query 参数名**（客户端传
 * `pageSize` 就静默失效回默认值），属于契约变更，因此保留两个入口、
 * 共用同一份严格整数解析（[toInt]）与夹取规则。
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

export interface PageParamsOptions {
  /** 不传 pageSize/limit 或非法时的默认值（默认 20） */
  defaultPageSize?: number;
  /** 单页上限（默认 100；题库随机抽题等场景传 50） */
  maxPageSize?: number;
}

export interface PageParams {
  page: number;
  pageSize: number;
  /** 已按夹取后的 page/pageSize 算好的偏移，永远是整数且 >= 0 */
  offset: number;
}

/**
 * 解析**页码式**分页：`page` + `pageSize`（history）或 `page` + `limit`（questions）。
 *
 * - `page`：非法或 <1 → 1
 * - `pageSize`：先看 `pageSize`，没有再回落到 `limit`（两套路由各用一套参数名）；
 *   非法或 <1 → `defaultPageSize`；> `maxPageSize` → `maxPageSize`
 * - `offset = (page - 1) * pageSize`
 *
 * 空串视作"未提供"（客户端清空输入框时常发出 `?pageSize=`），继续看下一个候选。
 */
export function parsePageParams(
  query: {
    page?: string | null;
    pageSize?: string | null;
    limit?: string | null;
  },
  options: PageParamsOptions = {},
): PageParams {
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_LIMIT;
  const maxPageSize = options.maxPageSize ?? MAX_LIMIT;

  // `page=0` / `page=-5` 若原样传给 SQL，offset 会变成负数（SQLite 当 0 处理，
  // 其它驱动可能直接报错），所以下限夹到 1。
  const rawPage = toInt(query.page ?? undefined, 1);
  const page = rawPage < 1 ? 1 : rawPage;

  // 两个参数名二选一：`pageSize` 优先（history 契约），其次 `limit`（questions 契约）。
  // 注意这里**不能**用 `toInt(..., defaultPageSize)` 一次性兜底，否则
  // `?pageSize=abc&limit=50` 与 `?pageSize=&limit=50` 无法区分。
  let rawPageSize = defaultPageSize;
  for (const candidate of [query.pageSize, query.limit]) {
    if (candidate === undefined || candidate === null) continue;
    if (candidate.trim() === "") continue;
    // 非法串（`12oops`）回落到默认值，而不是退到另一个参数 —— 显式给了就用它。
    rawPageSize = toInt(candidate, defaultPageSize);
    break;
  }
  const pageSize =
    rawPageSize < 1 ? defaultPageSize : Math.min(maxPageSize, rawPageSize);

  return { page, pageSize, offset: (page - 1) * pageSize };
}
