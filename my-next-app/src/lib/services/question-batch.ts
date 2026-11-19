/**
 * 题库批量建题（`POST /api/external/questions/batch` 的服务层）。
 *
 * ## 幂等键（硬规则 1）
 *
 * 每条题**优先用调用方给的 `externalId`**（粉笔等上游题号，跨重试稳定），
 * 没给才退回内容指纹 `api:`+（题干+选项+答案）（`question-idempotency.ts`）。
 * 命中既有行 → `status: "skipped"` 并回既有 `questionId`，**不更新内容**：
 * 批量导入是"补齐缺失的题"，不是"同步上游最新版"。要改内容走 `PATCH /questions/{id}`。
 *
 * 批内同一个键出现两次：第一份写入（`created`），后续 `skipped` 并指向同一个 id，
 * 保证"一次请求里同一道题只落一行"。此时以**第一份**的内容为准，后面的内容被忽略
 * （不做"内容不同就报冲突"——那会让上游一份错数据把整批堵死，且调用方无法自愈）。
 *
 * ## 并发
 *
 * 预检（先查已存在）只是为了让 `skipped` 语义准确；真正的并发保护是
 * `questions_external_id_unique` 唯一索引 + `onConflictDoNothing`。两者之间
 * 被别的请求抢先提交时，插入不会返回该行，回查一次拿既有 id 并记为 `skipped`。
 *
 * ## 不做什么
 *
 * 不写 `practice_logs` / 掌握度 / SRS：建题只动 `questions` 表
 * （与 `wrong-questions.ts` 的手动录题路径刻意分开，那条路径会连带写作答记录）。
 */

import { inArray } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { withTransaction } from "@/lib/db/executor";
import { buildApiExternalId } from "@/lib/services/question-idempotency";
import { logger } from "@/lib/logger";

/** 单批上限：与路由 schema 的 `.max(100)` 同一口径（服务层也拦一道） */
export const QUESTION_BATCH_MAX = 100;

/**
 * 单条 INSERT 的行数上限。
 *
 * SQLite 的绑定变量上限按「列数 × 行数」计（`SQLITE_MAX_VARIABLE_NUMBER`）。
 * 本题表一行 10 列，50 行 = 500 个变量，离常见上限（999/32766）都还远。
 */
const INSERT_CHUNK_SIZE = 50;

export type QuestionBatchType = "single" | "multi" | "truefalse" | "fill_blank";
export type QuestionBatchDimension =
  "knowledge" | "understanding" | "application";

/** 一条待建题目（已通过 `QuestionSchema` 校验，维度/题型已补默认值） */
export interface QuestionBatchCreateInput {
  externalId?: string;
  content: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
  dimension: QuestionBatchDimension;
  type: QuestionBatchType;
  source?: string;
  material?: string;
}

export interface QuestionBatchItemResult {
  /** 请求体里的下标（从 0 开始），批内有重复键时调用方靠它对回原条目 */
  index: number;
  /** 实际使用的幂等键（调用方没给就是内容指纹） */
  externalId: string;
  /** 落库或命中的题目 id；预演且需要新建、或并发窗口里那行被删时为 null */
  questionId: number | null;
  status: "created" | "skipped";
}

export interface QuestionBatchCreateResult {
  created: number;
  skipped: number;
  items: QuestionBatchItemResult[];
  /** true = 本次没有新建任何题（全部命中既有题或批内重复） */
  duplicate: boolean;
  /** 仅预演时出现且恒为 true：库内零变更 */
  dryRun?: true;
}

/** 每条题实际使用的幂等键：调用方给的一律优先，没给才用内容指纹 */
function resolveKey(item: QuestionBatchCreateInput): string {
  const provided = item.externalId?.trim();
  if (provided) return provided;
  return buildApiExternalId({
    content: item.content,
    options: item.options,
    answer: item.answer,
  });
}

/** 题目行 → 插入值（options/tags 按既有口径存 JSON 字符串） */
function toRow(item: QuestionBatchCreateInput, externalId: string) {
  return {
    external_id: externalId,
    content: item.content,
    options: JSON.stringify(item.options),
    answer: item.answer,
    explanation: item.explanation,
    tags: JSON.stringify(item.tags),
    dimension: item.dimension,
    type: item.type,
    source: item.source ?? null,
    material: item.material ?? null,
  };
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

/**
 * 批量建题。
 *
 * @param items 已校验的题目（路由层用 `QuestionSchema` 逐条校验过）
 * @param options.dryRun true = 只走查询与计算，不写库（返回"如果真执行会怎样"）
 */
export async function createQuestionsBatch(
  items: QuestionBatchCreateInput[],
  options: { dryRun?: boolean } = {},
): Promise<QuestionBatchCreateResult> {
  if (items.length === 0) {
    throw new Error("[QuestionBatch] 批量建题至少需要一条题目");
  }
  if (items.length > QUESTION_BATCH_MAX) {
    throw new Error(
      `[QuestionBatch] 单批最多 ${QUESTION_BATCH_MAX} 条，收到 ${items.length} 条`,
    );
  }

  const keys = items.map(resolveKey);
  // 每个键第一次出现的下标：批内重复条目靠它决定"谁是 created、谁是 skipped"
  const firstIndexByKey = new Map<string, number>();
  keys.forEach((key, index) => {
    if (!firstIndexByKey.has(key)) firstIndexByKey.set(key, index);
  });
  const uniqueKeys = [...firstIndexByKey.keys()];

  // 1. 预检：已有键 → skipped（如实回既有 id，不更新内容）
  const existingIdByKey = new Map<string, number>();
  const existingRows = await drizzleDb
    .select({
      id: drizzleSchema.questions.id,
      external_id: drizzleSchema.questions.external_id,
    })
    .from(drizzleSchema.questions)
    .where(inArray(drizzleSchema.questions.external_id, uniqueKeys));
  for (const row of existingRows) {
    if (typeof row.external_id === "string") {
      existingIdByKey.set(row.external_id, row.id);
    }
  }

  const pendingKeys = uniqueKeys.filter((key) => !existingIdByKey.has(key));

  if (options.dryRun) {
    const results = items.map((_item, index) => {
      const key = keys[index];
      const existingId = existingIdByKey.get(key);
      if (existingId !== undefined) {
        return {
          index,
          externalId: key,
          questionId: existingId,
          status: "skipped" as const,
        };
      }
      // 同一键的第二份及以后：真执行时也会被批内去重吃掉
      if (firstIndexByKey.get(key) !== index) {
        return {
          index,
          externalId: key,
          questionId: null,
          status: "skipped" as const,
        };
      }
      return {
        index,
        externalId: key,
        questionId: null,
        status: "created" as const,
      };
    });
    return summarize(results, true);
  }

  // 2. 插入新增行。分块 + 单事务：任何一块失败都整批回滚，不留半批
  const createdIdByKey = new Map<string, number>();
  if (pendingKeys.length > 0) {
    const rows = pendingKeys.map((key) => {
      const firstIndex = firstIndexByKey.get(key);
      // firstIndex 必然存在（pendingKeys 来自 firstIndexByKey 的键）
      return toRow(items[firstIndex as number], key);
    });

    await withTransaction(async (exec) => {
      for (const batch of chunk(rows, INSERT_CHUNK_SIZE)) {
        const inserted = await exec
          .insert(drizzleSchema.questions)
          .values(batch)
          .onConflictDoNothing({
            target: drizzleSchema.questions.external_id,
          })
          .returning({
            id: drizzleSchema.questions.id,
            external_id: drizzleSchema.questions.external_id,
          });
        for (const row of inserted) {
          if (typeof row.external_id === "string") {
            createdIdByKey.set(row.external_id, row.id);
          }
        }
      }
    });
  }

  // 3. 并发窗口：预检没命中、插入时被别的请求抢先（唯一索引吞掉插入）。
  //    回查一次拿既有 id —— 这是"抢占者赢了"，语义上就是 skipped，不是错误
  const racedKeys = pendingKeys.filter((key) => !createdIdByKey.has(key));
  if (racedKeys.length > 0) {
    const racedRows = await drizzleDb
      .select({
        id: drizzleSchema.questions.id,
        external_id: drizzleSchema.questions.external_id,
      })
      .from(drizzleSchema.questions)
      .where(inArray(drizzleSchema.questions.external_id, racedKeys));
    for (const row of racedRows) {
      if (typeof row.external_id === "string") {
        existingIdByKey.set(row.external_id, row.id);
      }
    }
    // 回查仍读不到：那行在插入与回查之间被删了（或落库被静默丢弃）。
    // 不编 id、不冒充 created —— 明确记一条结构化 warn，回执里 id 为 null
    const vanished = racedKeys.filter((key) => !existingIdByKey.has(key));
    if (vanished.length > 0) {
      logger.warn(
        { count: vanished.length, externalIds: vanished.slice(0, 5) },
        "[QuestionBatch] 插入被唯一索引吞掉后仍读不到既有行（可能已被并发删除），回执 id 为 null",
      );
    }
  }

  const results = items.map((_item, index) => {
    const key = keys[index];
    const createdId = createdIdByKey.get(key);
    const isFirstOfKey = firstIndexByKey.get(key) === index;

    if (createdId !== undefined && isFirstOfKey) {
      return {
        index,
        externalId: key,
        questionId: createdId,
        status: "created" as const,
      };
    }
    // 批内重复条目（或并发抢占后回查到的既有行）：指向同一个 id，不再插入
    const id = createdId ?? existingIdByKey.get(key) ?? null;
    return {
      index,
      externalId: key,
      questionId: id,
      status: "skipped" as const,
    };
  });

  return summarize(results, false);
}

function summarize(
  results: QuestionBatchItemResult[],
  dryRun: boolean,
): QuestionBatchCreateResult {
  const created = results.filter((item) => item.status === "created").length;
  const skipped = results.length - created;
  return {
    created,
    skipped,
    items: results,
    duplicate: created === 0 && skipped > 0,
    ...(dryRun ? { dryRun: true as const } : {}),
  };
}
