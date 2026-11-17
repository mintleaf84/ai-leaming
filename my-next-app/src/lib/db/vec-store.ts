import { log } from "@/lib/logger";
import { getLegacyDb } from "./index";

/**
 * 向量读写的**唯一入口**。
 *
 * 为什么单独一个模块：`sqlite-vec` 的 `vec0` 只能挂在 **legacy better-sqlite3**
 * 连接上（`db/index.ts` 在 `initDb()` 里 `loadExtension`）。应用主连接是
 * `@libsql/client`，实测对 `load_extension` 返回 `not authorized`，**不可能**
 * 加载扩展；因此任何跑在 `drizzleDb` 上的 `vec0` 语句都只会得到
 * `no such module: vec0`。把向量操作集中到这里，调用方（`vector-setup.ts`、
 * `services/question.ts`）就不必再各自猜该用哪个连接。
 *
 * 与 `db/index` 的静态环：`index → vector-setup → vec-store → index`。这里只在
 * 函数体内调用 `getLegacyDb()`（模块求值期不碰连接），环是安全的。
 */

/** 表名集中声明，避免各处拼字符串漂移 */
const QUESTION_VEC_TABLE = "questions_vec";
const CHUNK_VEC_TABLE = "rag_chunks_vec";

/** 与 `vector-setup.ts` 历史行为一致：读不到配置时退回的维度 */
const FALLBACK_EMBEDDING_DIM = 1024;

/**
 * 可用性探测结果缓存：`vec_version()` 每次约 1µs，但检索频繁时也没必要反复探。
 * 进程内扩展要么全局可用要么全局不可用（连接在 `globalForDb` 里单例），缓存安全。
 */
let availability: boolean | null = null;

/**
 * 维度必须与**应用实际用于 embed 的维度**一致，否则 vec0 会以
 * `Dimension mismatch` 拒绝写入。写成动态 import 而不是顶层 import：
 * `ai/config` 依赖 `@/lib/db`，顶层引入会与 `db/index → vec-store` 形成
 * 求值期的死环（同 `vector-setup.ts` 原有做法）。
 */
async function resolveEmbeddingDimensions(): Promise<number> {
  try {
    const { getAiConfig } = await import("@/lib/ai/config");
    const { embeddingDimensions } = await getAiConfig("embedding");
    return embeddingDimensions > 0
      ? Math.trunc(embeddingDimensions)
      : FALLBACK_EMBEDDING_DIM;
  } catch (error) {
    // audit-allow: 读不到配置不该阻止建表，退回默认维度并在日志里留痕
    log.warn(
      "[DB] 读取 embedding 维度失败，回退到默认值:",
      error instanceof Error ? error.message : String(error),
    );
    return FALLBACK_EMBEDDING_DIM;
  }
}

/**
 * sqlite-vec 是否可用（探测 `vec_version()`，结果缓存）。
 *
 * 不可用是**可预期的降级**：应用照常启动，只是 RAG / 相似题检索退化为空结果。
 */
export function isVectorAvailable(): boolean {
  if (availability !== null) return availability;

  try {
    const row = getLegacyDb()
      .prepare("SELECT vec_version() AS version")
      .get() as { version?: string } | undefined;
    availability = typeof row?.version === "string" && row.version.length > 0;
    if (!availability) {
      log.warn("[DB] sqlite-vec 探测无返回版本号，向量能力未启用");
    }
  } catch (error) {
    // audit-allow: 扩展缺失/加载失败是降级路径（应用可继续跑），记录后缓存 false
    log.warn(
      "[DB] sqlite-vec 扩展不可用，向量能力未启用:",
      error instanceof Error ? error.message : String(error),
    );
    availability = false;
  }

  return availability;
}

/**
 * 按配置维度建出两张向量表（幂等，`IF NOT EXISTS`）。
 *
 * 只在 legacy 连接上执行；返回 false 表示"向量能力不可用"，调用方据此降级。
 * 已存在的表不会被重建：维度变化需要显式迁移（`vec0` 不支持原地改维度）。
 */
export async function ensureVectorTables(): Promise<boolean> {
  if (!isVectorAvailable()) return false;

  const embeddingDim = await resolveEmbeddingDimensions();
  if (!Number.isInteger(embeddingDim) || embeddingDim <= 0) {
    log.warn(`[DB] embedding 维度非法 (${embeddingDim})，跳过向量表创建`);
    return false;
  }

  try {
    const db = getLegacyDb();
    // 维度只能内联进 DDL：`float[N]` 是类型声明，不能是绑定参数
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${QUESTION_VEC_TABLE} USING vec0(
        question_id INTEGER PRIMARY KEY,
        embedding float[${embeddingDim}]
      )`,
    );
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${CHUNK_VEC_TABLE} USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding float[${embeddingDim}]
      )`,
    );
    log.info(
      `[DB] 向量表就绪（float[${embeddingDim}]）：${QUESTION_VEC_TABLE}, ${CHUNK_VEC_TABLE}`,
    );
    return true;
  } catch (error) {
    // audit-allow: 建表失败降级为"无向量检索"，不阻断启动（上方 index.ts 也不阻断）
    log.warn(
      "[DB] 创建向量表失败，向量能力未启用:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

/**
 * 向量参数的传递形式：**JSON 数组文本**。
 *
 * 选它而不是 `Float32Array`：sqlite-vec 的 `INSERT` 与 `MATCH` 都接受 JSON，
 * 与既有测试/`ai/rag.ts` 里 `JSON.stringify(embedding)` 的写法一致；二进制
 * `Float32Array` 更省字节，但在 better-sqlite3 里会被当成 BLOB 绑定，
 * 出错时报错信息更模糊，且维度校验前的可读性差。
 */
function toVectorParam(embedding: number[]): string {
  return JSON.stringify(embedding);
}

/**
 * vec0 的主键是 64 位整数：better-sqlite3 会把 JS `number` 绑成 REAL，
 * 直接传 number 会得到 `Only integers are allows for primary key values`。
 * 写入/按主键查找必须用 BigInt；读回来再 `Number()`。
 */
function toVectorKey(id: number): bigint {
  return BigInt(Math.trunc(id));
}

/** 写入/覆盖一条题目向量（vec0 没有可靠的 UPSERT，用事务内 DELETE + INSERT） */
export function upsertQuestionVector(
  questionId: number,
  embedding: number[],
): void {
  const db = getLegacyDb();
  const key = toVectorKey(questionId);
  const write = db.transaction(() => {
    db.prepare(`DELETE FROM ${QUESTION_VEC_TABLE} WHERE question_id = ?`).run(
      key,
    );
    db.prepare(
      `INSERT INTO ${QUESTION_VEC_TABLE} (question_id, embedding) VALUES (?, ?)`,
    ).run(key, toVectorParam(embedding));
  });
  write();
}

/** 删除一条题目向量（题目被删/内容变化重算时调用） */
export function deleteQuestionVector(questionId: number): void {
  getLegacyDb()
    .prepare(`DELETE FROM ${QUESTION_VEC_TABLE} WHERE question_id = ?`)
    .run(toVectorKey(questionId));
}

/**
 * KNN 检索，按距离升序返回。表不存在时**抛错**：本模块不做兜底，
 * 由调用方决定"降级为空结果"还是"重抛"（`question.ts` 选前者）。
 */
export function searchQuestionVectors(
  embedding: number[],
  k: number,
): Array<{ questionId: number; distance: number }> {
  const rows = getLegacyDb()
    .prepare(
      `SELECT question_id, distance
       FROM ${QUESTION_VEC_TABLE}
       WHERE embedding MATCH ?
         AND k = ?
       ORDER BY distance`,
    )
    .all(toVectorParam(embedding), Math.trunc(k)) as Array<{
    question_id: number;
    distance: number;
  }>;

  return rows.map((row) => ({
    questionId: Number(row.question_id),
    distance: row.distance,
  }));
}

/** 写入/覆盖一条 RAG 分块向量（rag 侧暂未接入，先提供接口） */
export function upsertChunkVector(chunkId: number, embedding: number[]): void {
  const db = getLegacyDb();
  const key = toVectorKey(chunkId);
  const write = db.transaction(() => {
    db.prepare(`DELETE FROM ${CHUNK_VEC_TABLE} WHERE chunk_id = ?`).run(key);
    db.prepare(
      `INSERT INTO ${CHUNK_VEC_TABLE} (chunk_id, embedding) VALUES (?, ?)`,
    ).run(key, toVectorParam(embedding));
  });
  write();
}

/** 删除一条 RAG 分块向量 */
export function deleteChunkVector(chunkId: number): void {
  getLegacyDb()
    .prepare(`DELETE FROM ${CHUNK_VEC_TABLE} WHERE chunk_id = ?`)
    .run(toVectorKey(chunkId));
}

/** RAG 分块的 KNN 检索（同上：表不存在时抛错，由调用方降级） */
export function searchChunkVectors(
  embedding: number[],
  k: number,
): Array<{ chunkId: number; distance: number }> {
  const rows = getLegacyDb()
    .prepare(
      `SELECT chunk_id, distance
       FROM ${CHUNK_VEC_TABLE}
       WHERE embedding MATCH ?
         AND k = ?
       ORDER BY distance`,
    )
    .all(toVectorParam(embedding), Math.trunc(k)) as Array<{
    chunk_id: number;
    distance: number;
  }>;

  return rows.map((row) => ({
    chunkId: Number(row.chunk_id),
    distance: row.distance,
  }));
}
