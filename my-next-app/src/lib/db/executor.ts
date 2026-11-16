/**
 * 事务执行器（`exec`）类型与包装器。
 *
 * ## 为什么需要这一层
 *
 * drizzle 的 `db` 与事务里的 `tx` 查询 API 同形，但**类型不同**：`tx` 没有
 * `$client` 等成员，把 `tx` 直接当 `db` 传递会类型报错。于是各服务层抄了同一句咒语：
 *
 * ```ts
 * const exec = tx as unknown as typeof drizzleDb;
 * ```
 *
 * 这句话本身没错，但它此前散落在 9 处（`import-service`×2、`recall-import`×3、
 * `chat` / `pdf-import` / `recall` / `srs` 各 1）。drizzle 升级导致类型变化时，
 * 要逐个文件找；新写的代码也会继续复制这行。
 *
 * 这里把转换收成一个入口：业务侧只写 `withTransaction(async (exec) => …)`，
 * 不再自己 cast，未来的类型适配也只改这一个函数。
 */

import { drizzleDb } from "@/lib/db";

/** 事务内可用的执行器：与全局 `drizzleDb` 查询 API 同形 */
export type Executor = typeof drizzleDb;

/**
 * 唯一的 `tx → exec` 转换点。
 *
 * 用 `unknown` 中转而不是直接断言，是为了让「这里做了一次类型收敛」显式可见；
 * 真正保证安全的是调用方只在该事务连接上执行语句。
 */
export function asExecutor(tx: unknown): Executor {
  return tx as Executor;
}

/**
 * 在单个事务里执行 `fn`，回调拿到的 `exec` 已收敛成 `Executor`。
 *
 * 注意：`fn` 内**所有**语句都必须走 `exec`。混用全局 `drizzleDb` 会让语句跑在
 * 事务连接之外，表现为逐条 Failed query + 提交时 `SQLITE_BUSY`（历史事故形态）。
 */
export async function withTransaction<T>(
  fn: (exec: Executor) => Promise<T>,
): Promise<T> {
  return drizzleDb.transaction((tx) => fn(asExecutor(tx)));
}
