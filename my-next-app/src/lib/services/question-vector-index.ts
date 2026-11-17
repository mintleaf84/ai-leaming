import { asc, eq } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { ragService } from "@/lib/ai/rag";
// 命名空间导入而不是解构：降级用例要能 `vi.spyOn(vecStore, "isVectorAvailable")`
// 模拟"扩展不可用"，解构出来的绑定是快照，spy 拦不住。
import * as vecStore from "@/lib/db/vec-store";
import logger from "@/lib/logger";

/**
 * 题目向量索引（embedding 写入路径）。
 *
 * 第一步（#193）把向量读写收口到 `vec-store.ts`，表能建、检索能召回 —— 但**没有
 * 任何生产代码写向量**，所以空表上的检索永远返回 `[]`。本模块补上写入：
 *
 *   1. `indexQuestion(id, { pruneOnSkip })`：单题 upsert，管理端保存后 best-effort
 *      触发（内容变了却拿不到新向量时删旧向量，见 `IndexQuestionOptions`）；
 *   2. `reindexQuestions({ limit, offset })`：限量分批回填，由
 *      `scripts/reindex-question-vectors.ts` 驱动；**降级时保留已有向量**。
 *
 * 两条硬约束：
 *   - **降级伪向量绝不入库**：`rag.ts` 在 embedding API 失败时返回一条 `Math.sin`
 *     生成、维度正确的伪向量。判定只认 `getEmbeddingResult().degraded`，不用长度/
 *     方差这类启发式去猜（理由见 `EmbeddingResult` 的注释）；
 *   - **限量**：一次 embedding = 一次网络调用，上千题必须由脚本分批跑，绝不
 *     在请求路径上一次算完。
 */

/** 单次回填默认处理多少题：够用完 `embedding_cache` 预热，又不至于让一次调用跑太久 */
export const DEFAULT_REINDEX_LIMIT = 50;

/** 单次回填上限：再大就超出"可中断的一批"的范围，应该多跑几次脚本 */
export const MAX_REINDEX_LIMIT = 500;

export type QuestionIndexOutcome = "indexed" | "skipped" | "unavailable";

/**
 * 单题索引选项。
 *
 * `pruneOnSkip` 的两面性**不是随手写的默认值**：
 *   - 单题编辑（`admin-service.updateQuestion`）传 `true`：题干/选项/答案已经改了，
 *     却拿不到新向量（API 降级、题面被清空、题目已删）。此时旧向量描述的是**旧内容**，
 *     继续参与相似题检索等于按旧题干返回结果 —— 宁可这道题暂时检索不到。
 *   - 批量回填（`reindexQuestions`）保持 `false`：跑到一半 API 抖动就把索引删光，
 *     是把"部分过期"升级成"全空"，不可接受；照常计 `skipped`，旧向量留着。
 *
 * 所以默认值取批量那侧（安全侧），危险的删除必须由调用方显式打开。
 */
export interface IndexQuestionOptions {
  /** true = skipped 时删除该题已有向量（单题编辑路径）；默认 false = 保留（批量回填） */
  pruneOnSkip?: boolean;
}

export interface ReindexOptions {
  /** 本次最多处理多少题（默认 50，上限 500） */
  limit?: number;
  /** 从第几条开始（按 id 升序，默认 0） */
  offset?: number;
  /** 只统计不写：不调 embedding、不写向量表 */
  dryRun?: boolean;
  /** 每处理完一条回调一次（dry-run 不回调，因为没有任何"处理"） */
  onProgress?: (done: number, total: number) => void;
}

export interface ReindexResult {
  /** 本次取出的题目数（dry-run 时 = 待处理数，不是题库总数） */
  scanned: number;
  indexed: number;
  skipped: number;
  failed: number;
  /** sqlite-vec 不可用：整批跳过，不逐条失败 */
  unavailable: boolean;
}

/** 索引需要的列 —— 与内容指纹（`questionContentDigest`）同口径 */
interface IndexableQuestion {
  id: number;
  content: string | null;
  options: string | null;
  answer: string | null;
}

/**
 * 拼出用于 embedding 的文本：**题干 + 选项 JSON + 答案**。
 *
 * 字段选择与 `question-idempotency.ts` 的内容指纹一致（那三个字段共同决定"这是
 * 哪道题"），这样"同一个幂等键"与"同一段 embedding 文本"是对齐的：解析/标签/
 * 维度改变不需要重算向量，题干或选项或答案变了就必须重算。
 *
 * 选项在库里是 JSON 文本，这里**解析后再 `JSON.stringify`**，让分隔与空白归一化 ——
 * 否则 `["甲","乙"]` 与 `["甲", "乙"]` 会被当成两段不同文本，同一个幂等键却算出
 * 两个向量。解析失败说明是历史脏数据，退回原文并在日志里留痕。
 */
export function buildQuestionEmbeddingText(q: {
  content?: string | null;
  options?: unknown;
  answer?: string | null;
}): string {
  return [
    (q.content ?? "").trim(),
    stringifyOptions(q.options),
    (q.answer ?? "").trim(),
  ].join("\n");
}

function stringifyOptions(options: unknown): string {
  if (options === null || options === undefined) return "[]";
  if (typeof options !== "string") return JSON.stringify(options);

  try {
    return JSON.stringify(JSON.parse(options));
  } catch (error) {
    // audit-allow: 选项是历史脏数据时用原文兜底（不阻断索引），留痕后继续
    logger.warn(
      { err: error },
      "[QuestionVectorIndex] 选项 JSON 解析失败，按原文参与 embedding",
    );
    return options;
  }
}

/**
 * `pruneOnSkip` 场景下删除一条过期/孤儿向量；失败只记日志，不阻断主流程
 * （调用方是保存后的 best-effort 路径，删不掉最多多一条脏向量，不能反过来让保存失败）。
 */
function pruneVector(questionId: number, reason: string): void {
  try {
    vecStore.deleteQuestionVector(questionId);
    logger.info(
      { questionId, reason },
      "[QuestionVectorIndex] 内容已变但拿不到新向量，删除旧向量（宁可暂时检索不到，也不按旧内容召回）",
    );
  } catch (error) {
    // audit-allow: 删旧向量失败只是残留一条脏索引，不能反向阻断保存/回填
    logger.error(
      { err: error, questionId, reason },
      "[QuestionVectorIndex] 删除旧向量失败，该题可能按旧内容参与检索",
    );
  }
}

/** 实际写一条向量；失败（如维度不符）直接抛出，由调用方决定算 failed 还是上报 */
async function indexRow(
  row: IndexableQuestion,
  options: IndexQuestionOptions = {},
): Promise<"indexed" | "skipped"> {
  const prune = options.pruneOnSkip === true;

  // 题面为空就没有可索引的语义：拼出来的文本只有选项/答案，检索上去只会误召回
  if ((row.content ?? "").trim().length === 0) {
    // 内容已改空：旧向量描述的是旧题面，必须删（否则按旧题干召回）
    if (prune) pruneVector(row.id, "题面为空");
    return "skipped";
  }

  const text = buildQuestionEmbeddingText(row);
  const { vector, degraded } = await ragService.getEmbeddingResult(text);
  if (degraded) {
    logger.warn(
      { questionId: row.id },
      "[QuestionVectorIndex] embedding 走了降级路径（伪向量），跳过写入：向量索引只收真实向量",
    );
    // 单题编辑：旧向量已过期，删除；批量回填：保留（API 抖动不该清空索引）
    if (prune) pruneVector(row.id, "embedding 降级");
    return "skipped";
  }

  vecStore.upsertQuestionVector(row.id, vector);
  return "indexed";
}

/** 批量场景下单题失败不中断整批：记 failed + 结构化日志（带 questionId），继续下一条 */
async function attemptIndex(
  row: IndexableQuestion,
): Promise<"indexed" | "skipped" | "failed"> {
  try {
    // 批量路径**永远不 prune**：这是 pruneOnSkip 默认 false 的来源
    return await indexRow(row);
  } catch (error) {
    logger.error(
      { err: error, questionId: row.id },
      "[QuestionVectorIndex] 单题索引失败，跳过该题继续后续",
    );
    return "failed";
  }
}

function findQuestion(questionId: number) {
  return drizzleDb
    .select({
      id: drizzleSchema.questions.id,
      content: drizzleSchema.questions.content,
      options: drizzleSchema.questions.options,
      answer: drizzleSchema.questions.answer,
    })
    .from(drizzleSchema.questions)
    .where(eq(drizzleSchema.questions.id, questionId))
    .get();
}

/**
 * 给一道题建立/刷新向量索引。
 *
 * - `unavailable`：sqlite-vec 不可用，什么都没做；
 * - `skipped`：题目不存在、题面为空，或 embedding 降级（伪向量不入库）；
 * - `indexed`：已 upsert。
 *
 * 写入失败（维度不符等）会**抛出** —— 单题路径由调用方 best-effort 兜住，
 * 批量路径由 `attemptIndex` 计成 `failed`。故意图是"本周转不报错，只报告结果"。
 *
 * `options.pruneOnSkip` 的取舍见 `IndexQuestionOptions`：单题编辑传 `true`
 * （旧向量已过期，删掉），批量回填不传（保留，防 API 抖动清空索引）。
 */
export async function indexQuestion(
  questionId: number,
  options: IndexQuestionOptions = {},
): Promise<QuestionIndexOutcome> {
  if (!vecStore.isVectorAvailable()) return "unavailable";

  const prune = options.pruneOnSkip === true;

  const row = await findQuestion(questionId);
  if (!row) {
    logger.warn(
      { questionId },
      "[QuestionVectorIndex] 题目不存在（可能已被删除），跳过索引",
    );
    // 题目已删但向量还在 = 孤儿行；pruneOnSkip 场景一并清掉
    if (prune) pruneVector(questionId, "题目不存在");
    return "skipped";
  }

  return indexRow(row, options);
}

/**
 * 限量回填：按 id 升序取 `limit` 题，逐条 embed + upsert。
 *
 * 为什么逐条而不是 `getEmbeddings` 批量：embedding API 的批量上限与失败语义
 * 因供应商而异，而这里要的是"哪一题失败"的确定性 —— 一条失败只算 `failed`，
 * 不牵连整批。代价是 N 次调用，所以 `limit` 必须小、且由脚本来驱动。
 */
export async function reindexQuestions(
  options: ReindexOptions = {},
): Promise<ReindexResult> {
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const dryRun = options.dryRun === true;

  if (!vecStore.isVectorAvailable()) {
    logger.warn(
      "[QuestionVectorIndex] sqlite-vec 不可用，跳过整批回填（不是逐条失败）",
    );
    return {
      scanned: 0,
      indexed: 0,
      skipped: 0,
      failed: 0,
      unavailable: true,
    };
  }

  const rows = await drizzleDb
    .select({
      id: drizzleSchema.questions.id,
      content: drizzleSchema.questions.content,
      options: drizzleSchema.questions.options,
      answer: drizzleSchema.questions.answer,
    })
    .from(drizzleSchema.questions)
    .orderBy(asc(drizzleSchema.questions.id))
    .limit(limit)
    .offset(offset);

  // dry-run 只统计待处理数：连 embedding 都不算，自然不会有 API 调用
  if (dryRun) {
    return {
      scanned: rows.length,
      indexed: 0,
      skipped: 0,
      failed: 0,
      unavailable: false,
    };
  }

  let indexed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const outcome = await attemptIndex(row);
    if (outcome === "indexed") indexed++;
    else if (outcome === "failed") failed++;
    else skipped++;

    options.onProgress?.(indexed + skipped + failed, rows.length);
  }

  logger.info(
    {
      limit,
      offset,
      scanned: rows.length,
      indexed,
      skipped,
      failed,
    },
    "[QuestionVectorIndex] 回填完成",
  );

  return {
    scanned: rows.length,
    indexed,
    skipped,
    failed,
    unavailable: false,
  };
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_REINDEX_LIMIT;
  }
  const truncated = Math.trunc(value);
  if (truncated < 1) return 1;
  return Math.min(truncated, MAX_REINDEX_LIMIT);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}
