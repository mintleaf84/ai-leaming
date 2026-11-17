import { log } from "@/lib/logger";
import { ensureVectorTables, isVectorAvailable } from "./vec-store";

/**
 * 初始化 sqlite-vec 向量扩展和向量表。
 *
 * 历史实现直接在 `drizzleDb`（libsql 主连接）上跑 `SELECT vec_version()`：libsql
 * 对 `load_extension` 返回 `not authorized`，扩展**永远不会**在该连接上可用，
 * 于是这里每次都走降级分支、两张向量表从未被建出来（`questions_vec` 缺失 →
 * 相似题检索被 `no such module: vec0` 吞成空数组）。
 *
 * 现在只做一件事：委托给 `vec-store`（跑在唯一加载了扩展的 legacy
 * better-sqlite3 连接上）。签名保持不变，`initDatabase` 调用方无需改动；
 * 扩展真不可用时仍返回 false 并降级，不阻断启动。
 */
export async function setupVectorExtension(): Promise<boolean> {
  if (!isVectorAvailable()) {
    log.warn(
      "[DB] sqlite-vec 扩展未加载（libsql 主连接无法 load_extension，扩展只在 legacy better-sqlite3 连接上可用），向量能力未启用，跳过向量表创建",
    );
    return false;
  }

  const ready = await ensureVectorTables();
  if (!ready) {
    log.warn("[DB] 向量扩展可用但向量表未能就绪，向量能力未启用");
  }
  return ready;
}
