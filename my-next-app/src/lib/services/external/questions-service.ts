/**
 * `/api/external/questions` 的数据访问层。
 *
 * 从 `routes/external/questions.ts` **逐条原样搬移**：排序、分页默认值、字段裁剪、
 * 乐观锁条件、`onConflictDoNothing` 语义全部保持不变（行为等价是这次下沉的唯一判据）。
 *
 * ## 为什么不复用 `services/question.ts`
 *
 * - `questionService.list` 按 `desc(id)` 排序、`limit` 缺省 20、`tags` 取数组做 AND
 *   全匹配；外部 API 的口径是 `asc(id)` + 单 tag EXISTS + page/limit。改调会改变
 *   返回顺序与条数，属于行为变更。
 * - `questionService.getById` 过 `mapQuestion`（把 options/tags 反序列化成数组），
 *   而外部 API 的读处理器共用"原始行 + `safeParseJson`"的响应口径：混用会让同一个
 *   字段在不同端点出现两种形状（数组 vs JSON 字符串）。
 * - 写侧 `questionService.create/update` 走 `manual:` / `actor` 幂等键与审计日志，
 *   外部 API 用的是 `api:` 内容指纹 + 快照乐观锁 + 撞键回查，二者语义不同。
 *
 * 所以这里只搬查询，不做"顺手统一"。
 */

import { and, count, eq, isNull, sql } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "@/lib/db";

const questions = drizzleSchema.questions;

/** 列表接口返回的列（与迁移前 `select({...})` 完全一致） */
export interface QuestionListRow {
  id: number;
  type: string | null;
  dimension: string | null;
  content: string;
  options: string | null;
  answer: string | null;
  explanation: string | null;
  tags: string | null;
}

/** `available` 题库行的完整形状 */
export type QuestionRow = typeof drizzleSchema.questions.$inferSelect;

/**
 * 题库分页列表（外部 API 的 page/limit 口径）。
 *
 * `tag` 过滤保持原写法：`EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)`，
 * 与 `questionService.list` 的"多 tag AND"不是同一件事。
 */
export async function listQuestionsPage(options: {
  limit: number;
  offset: number;
  tag?: string;
}): Promise<{ total: number; rows: QuestionListRow[] }> {
  const tagCondition = options.tag
    ? sql`EXISTS (SELECT 1 FROM json_each(${questions.tags}) WHERE value = ${options.tag})`
    : undefined;

  // 隔离过滤（docs/agent-question-set-plan.md §2）：Agent 读到的「题库」与
  // 用户端题库列表同一口径 —— 只含 origin='import'。Agent 自己推来的题走
  // `/api/external/agent/question-sets/{id}` 读，不会在这里重复出现。
  const whereClause = and(eq(questions.origin, "import"), tagCondition);

  const [totalRow] = await drizzleDb
    .select({ value: count() })
    .from(questions)
    .where(whereClause);

  const rows = await drizzleDb
    .select({
      id: questions.id,
      type: questions.type,
      dimension: questions.dimension,
      content: questions.content,
      options: questions.options,
      answer: questions.answer,
      explanation: questions.explanation,
      tags: questions.tags,
    })
    .from(questions)
    .where(whereClause)
    .orderBy(questions.id)
    .limit(options.limit)
    .offset(options.offset)
    .all();

  return { total: totalRow.value, rows };
}

/** 按主键取整行（详情 / 改题前的快照读取共用） */
export async function findQuestionById(
  questionId: number,
): Promise<QuestionRow | null> {
  const row = await drizzleDb.query.questions.findFirst({
    where: eq(questions.id, questionId),
  });
  return row ?? null;
}

/** 按内容指纹取既有行 id（建题预检 / 并发回查 / 改题撞键检查共用） */
export async function findQuestionIdByExternalId(
  externalId: string,
): Promise<number | null> {
  const [row] = await drizzleDb
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.external_id, externalId))
    .limit(1);
  return row ? row.id : null;
}

/** 主键是否存在（改题 0 行更新后区分"题目被删"与"乐观锁冲突"） */
export async function questionIdExists(questionId: number): Promise<boolean> {
  const [row] = await drizzleDb
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  return Boolean(row);
}

export interface InsertQuestionInput {
  externalId: string;
  content: string;
  options: string;
  answer: string;
  explanation: string;
  tags: string;
  dimension: "knowledge" | "understanding" | "application";
  type: "single" | "multi" | "truefalse" | "fill_blank";
}

/**
 * 建题：`created_at` 用 SQLite `CURRENT_TIMESTAMP`，靠 `external_id` 唯一索引
 * 吞掉并发重复插入。被吞掉时返回 `null`，由调用方回查既有行（原路由的
 * 3 次退避重试留在路由层：那是重试策略，不是数据访问）。
 */
export async function insertQuestionIfAbsent(
  input: InsertQuestionInput,
): Promise<number | null> {
  const [inserted] = await drizzleDb
    .insert(questions)
    .values({
      external_id: input.externalId,
      content: input.content,
      options: input.options,
      answer: input.answer,
      explanation: input.explanation,
      tags: input.tags,
      dimension: input.dimension,
      type: input.type,
      created_at: sql`CURRENT_TIMESTAMP`,
    })
    .onConflictDoNothing({ target: questions.external_id })
    .returning({ id: questions.id });

  return inserted ? inserted.id : null;
}

/** 改题快照：读到的 content/options/answer 三要素，用于乐观锁 */
export interface QuestionPatchSnapshot {
  content: string;
  options: string | null;
  answer: string | null;
}

/**
 * 带快照乐观锁的部分更新。
 *
 * `options` / `answer` 可为 NULL：`eq(col, null)` 在 SQL 里恒不成立，必须改用
 * `isNull` 比较（迁移前就是这条，别"简化"成 eq）。返回被更新的行 id 数组，
 * 空数组表示"行已被删或已被他人改过"。
 */
export async function updateQuestionWithSnapshot(input: {
  questionId: number;
  nextValues: Record<string, unknown>;
  externalId: string;
  previousExternalId: string | null;
  snapshot: QuestionPatchSnapshot;
}): Promise<number[]> {
  const { questionId, snapshot } = input;

  const updated = await drizzleDb
    .update(questions)
    .set({
      ...input.nextValues,
      ...(input.externalId !== input.previousExternalId
        ? { external_id: input.externalId }
        : {}),
    })
    .where(
      and(
        eq(questions.id, questionId),
        eq(questions.content, snapshot.content),
        snapshot.options === null
          ? isNull(questions.options)
          : eq(questions.options, snapshot.options),
        snapshot.answer === null
          ? isNull(questions.answer)
          : eq(questions.answer, snapshot.answer),
      ),
    )
    .returning({ id: questions.id });

  return updated.map((row) => row.id);
}
