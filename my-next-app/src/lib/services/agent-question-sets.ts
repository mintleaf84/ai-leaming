/**
 * Agent 推题 / 题集服务（docs/agent-question-set-plan.md §2–§4）。
 *
 * ## 存储取舍（§2）
 *
 * 题本来就落 `questions`，靠 `origin` 打标记做隔离：
 * - `origin='agent'`：不进题库列表 / 自动组卷候选 / 掌握度聚合，但**可以**进
 *   错题本与历史（用户自己的作答记录，标出来反而有用）；
 * - 用户报「这题有问题」→ `origin='flagged'`（消费侧查询过滤掉）；
 * - 转正 → `origin='import'`，从此就是普通题库题。
 * 选它而不是物理隔离（另建题目表）的原因只有一个：`practice_logs.question_id`
 * 是 `questions(id)` 的外键，错题本/掌握度/历史全部基于它，另建表等于 Agent 题
 * 永远进不了错题本。
 *
 * ## 幂等（硬规则 1）
 *
 * 幂等键是**上游批次键** `batchKey`（Agent 生成，跨重试稳定），
 * `UNIQUE(user_id, batch_key)` 在库一级兜底。重推同一批：不写库、原样返回既有
 * 批次（`duplicate: true`）。批次**不可变** —— 要改内容只能新建批次。
 *
 * 题目行的 `external_id` 由 `agent:<userId>:<batchKey>:<externalId|position>`
 * 构成，而不是内容指纹：内容是 Agent 生成的，同一题干在不同批次里合法重复，
 * 用内容指纹会撞 `questions_external_id_unique` 把整批堵死。
 *
 * ## 响应形状
 *
 * 对外形状**逐字对齐** §4.3（三条 lane 的共同契约）：
 * - 列表一律 `{data, meta:{limit,offset,total}}`；
 * - 消费侧题目用 `id` 且**不含** answer/explanation，agent 侧详情**含**答案；
 * - 结果回流 `{setId, summary:{…}, items:[…], flagged:[…]}`；
 * - 分数一律 0–1 小数，`durationMs` 整数毫秒。
 *
 * ## 为什么不用 `createQuestionsBatch`
 *
 * 那个函数自带事务、只写 `questions`，并且会做「既有 external_id 命中即跳过」的
 * 内容去重 —— 与题集语义（批次内每题都要落一行、题有 agent_set_id/position）
 * 相反。这里在同一条事务里写 `agent_question_sets` + N 条 `questions`，整批原子。
 */

import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { drizzleDb } from "@/lib/db";
import {
  agent_question_sets,
  practice_logs,
  practice_sessions,
  questions,
} from "@/lib/db/drizzle-schema";
import { withTransaction } from "@/lib/db/executor";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors/app-error";
import { QuestionSchema } from "@/lib/schemas";
import { indexQuestion } from "@/lib/services/question-vector-index";
import { examService } from "@/lib/services/exam";
import { generateSessionId } from "@/lib/utils/id";
import { safeParseJson } from "@/lib/utils/json";
import { logger } from "@/lib/logger";

/** 单批上限（与 `POST /questions/batch` 同口径） */
export const AGENT_SET_MAX_QUESTIONS = 100;

/** 一次 INSERT 的行数：13 列 × 50 行 = 650 个绑定变量，离 SQLite 上限还远 */
const INSERT_CHUNK_SIZE = 50;

type AgentSetStatus = "active" | "archived" | "promoted";

// --- 错误类型（状态码由 AppError.kind 决定） ---

/** 题集不存在**或不属于当前用户**：一律 404，不泄露"这个 id 存在" */
export class AgentSetNotFoundError extends NotFoundError {
  constructor(setId: number) {
    super(`题集不存在：${setId}`, {
      code: "agent-set.not-found",
      publicMessage: "题集不存在",
    });
  }
}

/** 整批校验失败：任一条不合格整批拒绝（不做部分成功），issues 逐条列出 */
export class AgentSetQuestionsInvalidError extends ValidationError {
  constructor(issues: string[]) {
    super(`题集校验失败（整批未写入）：${issues.length} 处不合法`, {
      code: "agent-set.questions.invalid",
      publicMessage: "题集校验失败（整批未写入）",
      issues,
    });
  }
}

/** 题集状态不允许该操作（已归档 / 已转正） */
export class AgentSetStateError extends ConflictError {
  constructor(setId: number, status: AgentSetStatus, action: string) {
    super(`题集当前状态为 ${status}，不能${action}`, {
      code: "agent-set.state.conflict",
      publicMessage: `题集当前状态为 ${status}，不能${action}`,
    });
    this.name = "AgentSetStateError";
    this.setId = setId;
  }

  readonly setId: number;
}

// --- 对外类型（§4.3 冻结形状） ---

/** Agent 侧列表 / 详情里的 set 对象 */
export interface AgentSetSummary {
  id: number;
  batchKey: string;
  title: string;
  agent: string | null;
  model: string | null;
  promptVersion: string | null;
  /** Agent 声称针对的考点（只作展示，不参与任何过滤） */
  targetTags: string[];
  note: string | null;
  status: AgentSetStatus;
  /** 该批**可用**题数（已报错的题不计入） */
  questionCount: number;
  /** 已作答的题数（只看该题集自己的作答会话，去重） */
  doneCount: number;
  flaggedCount: number;
  createdAt: string | null;
}

/** 消费侧列表 / 详情里的 set 对象 */
export interface ConsumerSetSummary {
  id: number;
  title: string;
  agent: string | null;
  model: string | null;
  targetTags: string[];
  /** 批次原始题量（含被用户报错移除的题）；Web 的「已做 = 总数 − 未做 − 已反馈」依赖这个口径 */
  questionCount: number;
  /** 题集状态：active | promoted（已转正入库）| archived */
  status: AgentSetStatus;
  /** 未作答的可用题数 */
  pendingCount: number;
  /**
   * 「未读题数」：批次**还没有任何作答记录**时等于 questionCount，否则为 0。
   *
   * 本期不做服务端已读表（§6：通知只做启动/回前台拉未读 + 本地通知 + 角标），
   * 客户端把各题集的 unreadCount 求和即得首页角标；打开/作答后该批自然归零。
   */
  unreadCount: number;
  /** 最近一次作答的正确率（0–1 小数）；从未作答为 null */
  lastScore: number | null;
  createdAt: string | null;
}

/** 消费侧题目（**不含** answer / explanation） */
export interface ConsumerSetQuestion {
  id: number;
  content: string;
  options: string[];
  type: string | null;
  dimension: string | null;
  tags: string[];
  material: string | null;
}

/** Agent 侧题目（含答案与解析：Agent 要能看自己推了什么） */
export interface AgentSetQuestion {
  id: number;
  position: number | null;
  /** Agent 自己的题号（推送时给的 `externalId`；没给为 null） */
  externalId: string | null;
  content: string;
  options: string[];
  answer: string;
  explanation: string | null;
  type: string | null;
  dimension: string | null;
  tags: string[];
  material: string | null;
}

export interface AgentSetQuestionInput {
  externalId?: string;
  content: string;
  options?: string[];
  answer: string;
  explanation?: string;
  tags?: string[];
  dimension?: string;
  type?: string;
  material?: string;
}

export interface CreateAgentSetInput {
  batchKey: string;
  title: string;
  agent?: string;
  model?: string;
  promptVersion?: string;
  targetTags?: string[];
  note?: string;
  questions: AgentSetQuestionInput[];
}

/** `POST /agent/question-sets` 的响应（§4.3） */
export interface CreateAgentSetResult {
  /** 预演且需要新建时为 null */
  id: number | null;
  batchKey: string;
  duplicate: boolean;
  /** 该批题数（幂等命中为既有批次的题数） */
  questionCount: number;
  /** 仅预演时出现且恒为 true：库内零变更（形状冻结之外的唯一附加字段） */
  dryRun?: true;
}

export interface AgentSetResults {
  setId: number;
  summary: {
    /** 已作答的可用题数 */
    answered: number;
    /** 该批题总数（含已报错的题） */
    total: number;
    /** correct / answered，0–1 小数 */
    correctRate: number;
    /** 已作答题的平均耗时（毫秒，整数） */
    avgDurationMs: number;
    tagBreakdown: Array<{
      tag: string;
      answered: number;
      correctRate: number;
    }>;
  };
  items: Array<{
    questionId: number;
    answered: boolean;
    /** 未作答时为 false（用 answered 区分） */
    isCorrect: boolean;
    durationMs: number | null;
    flagged: boolean;
    flagReason: string | null;
  }>;
  flagged: Array<{
    questionId: number;
    content: string;
    reason: string | null;
  }>;
}

export interface AgentSetAttempt {
  sessionId: string;
  questions: ConsumerSetQuestion[];
}

// --- 内部辅助 ---

/** 题目行的 external_id：`agent:<userId>:<batchKey>:<externalId 或 position>` */
function buildAgentExternalId(
  userId: number,
  batchKey: string,
  item: AgentSetQuestionInput,
  position: number,
): string {
  const callerKey = item.externalId?.trim();
  return `agent:${userId}:${batchKey}:${callerKey || position}`;
}

/** 从 external_id 还原 Agent 自己的题号（纯数字后缀 = 调用方没给，回 null） */
function parseAgentExternalId(
  userId: number,
  batchKey: string,
  externalId: string | null,
): string | null {
  if (!externalId) return null;
  const prefix = `agent:${userId}:${batchKey}:`;
  if (!externalId.startsWith(prefix)) return null;
  const suffix = externalId.slice(prefix.length);
  return /^\d+$/.test(suffix) ? null : suffix;
}

/** 批次键唯一约束冲突：并发重推时由库兜底，语义是"已经有人先建了" */
function isBatchKeyConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("UNIQUE constraint failed") &&
    message.includes("agent_question_sets")
  );
}

function toTargetTags(raw: string | null): string[] {
  return safeParseJson<string[]>(raw, []);
}

/**
 * 题集聚合列（列表与详情共用）。
 *
 * - questionCount：**可用**题（`origin='agent'`）；已报错的单独计数，
 *   这样"转正后 questionCount 归零 + flaggedCount 不变"也说得通；
 * - doneCount：只看**该题集自己的作答会话**（`practice_sessions.agent_set_id`），
 *   同一道题在普通练习里答过不算"这批做完了"；
 * - lastScore：最近一次**有非空作答**的会话里 `correct_count / 非跳过日志数`。
 *
 * 相关子查询里的外层引用必须**带表名**：drizzle 在 select 列表里展开整表选择时
 * 会去掉列前缀，`${agent_question_sets.id}` 会渲染成裸 `"id"`，SQLite 会报
 * ambiguous column name（子查询自己的 FROM 也有 id）。故用 sql.raw 固定。
 */
function setAggregates(userId: number) {
  const outerId = sql.raw(`"agent_question_sets"."id"`);
  return {
    /**
     * 批次**原始题量**（含被用户报错的题）。
     *
     * Web 端派生「已做 = questionCount − pendingCount − flaggedCount」依赖这个
     * 口径：questionCount 不含 flagged 的话会把 flagged 减两次。
     */
    questionCount: sql<number>`(
      SELECT COUNT(*) FROM questions q
      WHERE q.agent_set_id = ${outerId}
    )`,
    /** 仍可用（未被报错）的题数；promote 后 origin 转 import，仍然计入 */
    usableCount: sql<number>`(
      SELECT COUNT(*) FROM questions q
      WHERE q.agent_set_id = ${outerId} AND q.origin != 'flagged'
    )`,
    flaggedCount: sql<number>`(
      SELECT COUNT(*) FROM questions q
      WHERE q.agent_set_id = ${outerId} AND q.origin = 'flagged'
    )`,
    doneCount: sql<number>`(
      SELECT COUNT(DISTINCT q.id) FROM questions q
      JOIN practice_logs pl ON pl.question_id = q.id
      JOIN practice_sessions ps ON ps.id = pl.session_id
      WHERE q.agent_set_id = ${outerId}
        AND ps.agent_set_id = ${outerId}
        AND ps.user_id = ${userId}
        AND pl.status != 'skipped'
    )`,
    lastScore: sql<number | null>`(
      SELECT CAST(ps.correct_count AS REAL) / (
        SELECT COUNT(*) FROM practice_logs pl2
        WHERE pl2.session_id = ps.id AND pl2.status != 'skipped'
      )
      FROM practice_sessions ps
      WHERE ps.agent_set_id = ${outerId}
        AND ps.user_id = ${userId}
        AND EXISTS (
          SELECT 1 FROM practice_logs pl3
          WHERE pl3.session_id = ps.id AND pl3.status != 'skipped'
        )
      ORDER BY ps.created_at DESC, ps.rowid DESC
      LIMIT 1
    )`,
  };
}

type SetRow = typeof agent_question_sets.$inferSelect;

interface Aggregates {
  questionCount: number | null;
  usableCount: number | null;
  flaggedCount: number | null;
  doneCount: number | null;
  lastScore: number | null;
}

function toAgentSummary(row: SetRow, agg: Aggregates): AgentSetSummary {
  return {
    id: row.id,
    batchKey: row.batch_key,
    title: row.title,
    agent: row.agent ?? null,
    model: row.model ?? null,
    promptVersion: row.prompt_version ?? null,
    targetTags: toTargetTags(row.target_tags),
    note: row.note ?? null,
    status: (row.status as AgentSetStatus) ?? "active",
    questionCount: Number(agg.questionCount ?? 0),
    doneCount: Number(agg.doneCount ?? 0),
    flaggedCount: Number(agg.flaggedCount ?? 0),
    createdAt: row.created_at ?? null,
  };
}

function toConsumerSummary(row: SetRow, agg: Aggregates): ConsumerSetSummary {
  const questionCount = Number(agg.questionCount ?? 0);
  const usableCount = Number(agg.usableCount ?? 0);
  const doneCount = Number(agg.doneCount ?? 0);
  const lastScore =
    agg.lastScore === null || agg.lastScore === undefined
      ? null
      : Number(agg.lastScore);
  // 已读时机（§4.3 Web lane 冻结）：GET 详情即写 read_at，之后 unreadCount 归零；
  // 从未打开但已经开始做（极端路径）也算读过，避免角标永远消不掉。
  const unread = row.read_at === null && doneCount === 0;
  return {
    id: row.id,
    title: row.title,
    agent: row.agent ?? null,
    model: row.model ?? null,
    targetTags: toTargetTags(row.target_tags),
    status: (row.status as AgentSetStatus) ?? "active",
    questionCount,
    // 未做 = 可用题 − 已做；flagged 的题本来就不在"可做"里
    pendingCount: Math.max(0, usableCount - doneCount),
    unreadCount: unread ? questionCount : 0,
    lastScore,
    createdAt: row.created_at ?? null,
  };
}

/**
 * 「打开即已读」的幂等写（§4.3 Web lane 冻结）：只在 `read_at IS NULL` 时写。
 *
 * 返回 false 表示这次没写成功（DB 抖动等）。已读标记是派生状态，写失败不能让
 * 详情读成 500 —— 调用方照常返回内容，下次打开会重试（条件仍是 read_at IS NULL）。
 */
async function markSetRead(userId: number, setId: number): Promise<boolean> {
  try {
    await drizzleDb
      .update(agent_question_sets)
      .set({ read_at: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(agent_question_sets.id, setId),
          eq(agent_question_sets.user_id, userId),
          sql`${agent_question_sets.read_at} IS NULL`,
        ),
      );
    return true;
  } catch (err) {
    // 显式降级：已读标记写失败不影响本次详情读取（不是业务错误，也不该 500）
    logger.warn(
      { err, userId, setId },
      "[AgentSet] 写已读时间失败（详情照常返回）",
    );
    return false;
  }
}

/** 取题集行（带归属校验：他人的 id 与不存在的 id 同样 404） */
async function loadSetRow(userId: number, setId: number): Promise<SetRow> {
  const [row] = await drizzleDb
    .select()
    .from(agent_question_sets)
    .where(
      and(
        eq(agent_question_sets.id, setId),
        eq(agent_question_sets.user_id, userId),
      ),
    )
    .limit(1);
  if (!row) throw new AgentSetNotFoundError(setId);
  return row;
}

/** 单条聚合（详情用；与列表同一份 SQL） */
async function loadAggregates(
  userId: number,
  setId: number,
): Promise<Aggregates> {
  const [row] = await drizzleDb
    .select(setAggregates(userId))
    .from(agent_question_sets)
    .where(
      and(
        eq(agent_question_sets.id, setId),
        eq(agent_question_sets.user_id, userId),
      ),
    )
    .limit(1);
  return {
    questionCount: row?.questionCount ?? 0,
    usableCount: row?.usableCount ?? 0,
    flaggedCount: row?.flaggedCount ?? 0,
    doneCount: row?.doneCount ?? 0,
    lastScore: row?.lastScore ?? null,
  };
}

async function loadSetQuestions(
  setId: number,
): Promise<Array<typeof questions.$inferSelect>> {
  return drizzleDb
    .select()
    .from(questions)
    .where(eq(questions.agent_set_id, setId))
    .orderBy(asc(questions.agent_position), asc(questions.id));
}

/** 练习 / 成卷的可用题：仍在题集里的（`origin='agent'`），转正后自然为空 */
async function loadUsableAgentQuestions(
  setId: number,
): Promise<Array<typeof questions.$inferSelect>> {
  return drizzleDb
    .select()
    .from(questions)
    .where(
      and(eq(questions.agent_set_id, setId), eq(questions.origin, "agent")),
    )
    .orderBy(asc(questions.agent_position), asc(questions.id));
}

/**
 * 消费侧详情展示的题：**仍属该 set 且未被用户报错**。
 *
 * 与"可练题"的区别：转正后 origin 变 `import`，题已经并入题库，但它仍然属于
 * 这个批次，详情里要看得见（Web lane 冻结：promote 后详情不 404，questions 只含
 * 仍属该 set 的题）。flagged 的题从详情里移除，数量由 `flaggedCount` 交代。
 */
async function loadVisibleQuestions(
  setId: number,
): Promise<Array<typeof questions.$inferSelect>> {
  return drizzleDb
    .select()
    .from(questions)
    .where(
      and(eq(questions.agent_set_id, setId), ne(questions.origin, "flagged")),
    )
    .orderBy(asc(questions.agent_position), asc(questions.id));
}

function toConsumerQuestion(
  row: typeof questions.$inferSelect,
): ConsumerSetQuestion {
  return {
    id: row.id,
    content: row.content,
    options: safeParseJson<string[]>(row.options, []),
    type: row.type ?? null,
    dimension: row.dimension ?? null,
    tags: safeParseJson<string[]>(row.tags, []),
    material: row.material ?? null,
  };
}

function toAgentQuestion(
  row: typeof questions.$inferSelect,
  userId: number,
  batchKey: string,
): AgentSetQuestion {
  return {
    id: row.id,
    position: row.agent_position ?? null,
    externalId: parseAgentExternalId(userId, batchKey, row.external_id),
    content: row.content,
    options: safeParseJson<string[]>(row.options, []),
    answer: row.answer ?? "",
    explanation: row.explanation ?? null,
    type: row.type ?? null,
    dimension: row.dimension ?? null,
    tags: safeParseJson<string[]>(row.tags, []),
    material: row.material ?? null,
  };
}

/**
 * 整批校验：复用 `QuestionSchema`（与后台导入 / 单题建题 / 批量建题**同一份**规则）。
 *
 * 任一条不合法 → 收集全部 issue 后整批拒绝（不做部分成功）。issue 文案与
 * `POST /questions/batch` 同形：`questions.<index>.<path>: <message>`。
 */
function validateQuestions(inputs: AgentSetQuestionInput[]): Array<{
  content: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
  dimension: "knowledge" | "understanding" | "application";
  type: string;
  material: string | null;
}> {
  const issues: string[] = [];
  const parsed: Array<{
    content: string;
    options: string[];
    answer: string;
    explanation: string;
    tags: string[];
    dimension: "knowledge" | "understanding" | "application";
    type: string;
    material: string | null;
  }> = [];

  inputs.forEach((raw, index) => {
    const result = QuestionSchema.safeParse({
      content: raw.content,
      // 与批量建题一致：选项缺省空数组、维度缺省 knowledge、题型缺省 single
      options: raw.options ?? [],
      answer: raw.answer,
      explanation: raw.explanation,
      tags: raw.tags,
      dimension: raw.dimension ?? "knowledge",
      type: raw.type,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.map(String).join(".");
        issues.push(`questions.${index}.${path || "body"}: ${issue.message}`);
      }
      return;
    }
    parsed.push({
      content: result.data.content,
      options: result.data.options,
      answer: result.data.answer,
      explanation: result.data.explanation,
      tags: result.data.tags,
      // QuestionSchema 的 dimension 是"三档枚举 or 任意字符串"，插入时按列类型收窄
      dimension: result.data.dimension as
        "knowledge" | "understanding" | "application",
      type: result.data.type,
      material: raw.material ?? null,
    });
  });

  if (issues.length > 0) throw new AgentSetQuestionsInvalidError(issues);
  return parsed;
}

// --- 服务 ---

export const agentQuestionSetService = {
  /**
   * 建题集（`POST /api/external/agent/question-sets`）。
   *
   * 整批原子：`agent_question_sets` 一行 + N 条 `questions` 在**一条事务**里写；
   * 任一题不合格在写库前就整批拒绝。同 `(user, batchKey)` 重推返回既有批次。
   */
  async createSet(
    userId: number,
    input: CreateAgentSetInput,
    options: { dryRun?: boolean } = {},
  ): Promise<CreateAgentSetResult> {
    const batchKey = input.batchKey.trim();
    const title = input.title.trim();

    const headerIssues: string[] = [];
    if (!batchKey) headerIssues.push("batchKey: 不能为空");
    if (batchKey.length > 200) headerIssues.push("batchKey: 最长 200 字符");
    if (!title) headerIssues.push("title: 不能为空");
    if (title.length > 200) headerIssues.push("title: 最长 200 字符");
    if (headerIssues.length > 0) {
      throw new AgentSetQuestionsInvalidError(headerIssues);
    }

    if (input.questions.length === 0) {
      throw new AgentSetQuestionsInvalidError(["questions: 至少需要 1 道题"]);
    }
    if (input.questions.length > AGENT_SET_MAX_QUESTIONS) {
      throw new AgentSetQuestionsInvalidError([
        `questions: 单批最多 ${AGENT_SET_MAX_QUESTIONS} 道题，收到 ${input.questions.length} 道`,
      ]);
    }

    const items = validateQuestions(input.questions);

    // 幂等预检：同一批次重推直接返回既有批次（含 dryRun —— 预演也该看到"会命中"）
    const [existing] = await drizzleDb
      .select()
      .from(agent_question_sets)
      .where(
        and(
          eq(agent_question_sets.user_id, userId),
          eq(agent_question_sets.batch_key, batchKey),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        id: existing.id,
        batchKey: existing.batch_key,
        duplicate: true,
        questionCount: (await loadSetQuestions(existing.id)).length,
      };
    }

    if (options.dryRun) {
      return {
        id: null,
        batchKey,
        duplicate: false,
        questionCount: items.length,
        dryRun: true,
      };
    }

    try {
      const setId = await withTransaction(async (exec) => {
        const [inserted] = await exec
          .insert(agent_question_sets)
          .values({
            user_id: userId,
            batch_key: batchKey,
            title,
            agent: input.agent?.trim() || null,
            model: input.model?.trim() || null,
            prompt_version: input.promptVersion?.trim() || null,
            target_tags: input.targetTags
              ? JSON.stringify(
                  input.targetTags.map((t) => t.trim()).filter(Boolean),
                )
              : null,
            note: input.note?.trim() || null,
            status: "active",
          })
          .returning({ id: agent_question_sets.id });

        const rows = items.map((item, index) => ({
          external_id: buildAgentExternalId(
            userId,
            batchKey,
            input.questions[index],
            index + 1,
          ),
          content: item.content,
          options: JSON.stringify(item.options),
          answer: item.answer,
          explanation: item.explanation,
          tags: JSON.stringify(item.tags),
          dimension: item.dimension,
          type: item.type,
          material: item.material,
          // 隔离标记：这批题默认不进题库列表 / 自动组卷 / 掌握度
          origin: "agent" as const,
          agent_set_id: inserted.id,
          agent_position: index + 1,
        }));

        for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
          await exec
            .insert(questions)
            .values(rows.slice(i, i + INSERT_CHUNK_SIZE));
        }

        return inserted.id;
      });

      return {
        id: setId,
        batchKey,
        duplicate: false,
        questionCount: items.length,
      };
    } catch (err) {
      // 并发重推：两个请求同时过了预检，后提交的撞唯一索引 —— 语义就是"已存在"，
      // 回既有批次而不是 500（硬规则 1：同一份数据执行两次不得产生重复批次）
      if (isBatchKeyConflict(err)) {
        const [raceWinner] = await drizzleDb
          .select()
          .from(agent_question_sets)
          .where(
            and(
              eq(agent_question_sets.user_id, userId),
              eq(agent_question_sets.batch_key, batchKey),
            ),
          )
          .limit(1);
        if (raceWinner) {
          return {
            id: raceWinner.id,
            batchKey: raceWinner.batch_key,
            duplicate: true,
            questionCount: (await loadSetQuestions(raceWinner.id)).length,
          };
        }
        logger.error(
          { err, userId, batchKey },
          "[AgentSet] 批次唯一冲突后仍读不到既有行",
        );
      }
      throw err;
    }
  },

  /** Agent 侧题集列表（`GET /api/external/agent/question-sets`） */
  async listSetsForAgent(
    userId: number,
    options: { limit: number; offset: number },
  ): Promise<{
    data: AgentSetSummary[];
    meta: { limit: number; offset: number; total: number };
  }> {
    const { limit, offset } = options;

    const rows = await drizzleDb
      .select({ set: agent_question_sets, ...setAggregates(userId) })
      .from(agent_question_sets)
      .where(eq(agent_question_sets.user_id, userId))
      .orderBy(
        desc(agent_question_sets.created_at),
        desc(agent_question_sets.id),
      )
      .limit(limit)
      .offset(offset);

    const [countRow] = await drizzleDb
      .select({ total: sql<number>`count(*)` })
      .from(agent_question_sets)
      .where(eq(agent_question_sets.user_id, userId));

    return {
      data: rows.map((row) => toAgentSummary(row.set, row)),
      meta: { limit, offset, total: Number(countRow?.total ?? 0) },
    };
  },

  /** 消费侧题集列表（`GET /api/agent-sets`） */
  async listSetsForConsumer(
    userId: number,
    options: { limit: number; offset: number },
  ): Promise<{
    data: ConsumerSetSummary[];
    meta: { limit: number; offset: number; total: number };
  }> {
    const { limit, offset } = options;

    const rows = await drizzleDb
      .select({ set: agent_question_sets, ...setAggregates(userId) })
      .from(agent_question_sets)
      .where(eq(agent_question_sets.user_id, userId))
      .orderBy(
        desc(agent_question_sets.created_at),
        desc(agent_question_sets.id),
      )
      .limit(limit)
      .offset(offset);

    const [countRow] = await drizzleDb
      .select({ total: sql<number>`count(*)` })
      .from(agent_question_sets)
      .where(eq(agent_question_sets.user_id, userId));

    return {
      data: rows.map((row) => toConsumerSummary(row.set, row)),
      meta: { limit, offset, total: Number(countRow?.total ?? 0) },
    };
  },

  /** Agent 侧详情：**含答案与解析**（Agent 要能看自己推了什么） */
  async getSetForAgent(
    userId: number,
    setId: number,
  ): Promise<{ set: AgentSetSummary; questions: AgentSetQuestion[] }> {
    const row = await loadSetRow(userId, setId);
    const agg = await loadAggregates(userId, setId);
    const rows = await loadSetQuestions(setId);
    return {
      set: toAgentSummary(row, agg),
      questions: rows.map((item) =>
        toAgentQuestion(item, userId, row.batch_key),
      ),
    };
  },

  /**
   * 消费侧详情：**不含**答案与解析；`questions` 只含可用题
   * （已报错的题由 `flaggedCount` 交代，不再出现在练习列表里）。
   */
  async getSetForConsumer(
    userId: number,
    setId: number,
  ): Promise<{
    set: ConsumerSetSummary;
    questions: ConsumerSetQuestion[];
    flaggedCount: number;
  }> {
    const row = await loadSetRow(userId, setId);

    // 「打开即已读」（§4.3 Web lane 冻结）：GET 详情本身就是已读动作，幂等写一次
    // `read_at`；列表接口只读、不写。
    if (row.read_at === null) {
      await markSetRead(userId, setId);
    }

    const agg = await loadAggregates(userId, setId);
    const rows = await loadVisibleQuestions(setId);
    return {
      set: toConsumerSummary({ ...row, read_at: row.read_at ?? "read" }, agg),
      questions: rows.map(toConsumerQuestion),
      flaggedCount: Number(agg.flaggedCount ?? 0),
    };
  },

  /** 归档（不影响历史；归档后不能再作答/成卷/转正） */
  async archiveSet(userId: number, setId: number): Promise<AgentSetSummary> {
    const row = await loadSetRow(userId, setId);
    if (row.status !== "archived") {
      await drizzleDb
        .update(agent_question_sets)
        .set({ status: "archived" })
        .where(
          and(
            eq(agent_question_sets.id, setId),
            eq(agent_question_sets.user_id, userId),
          ),
        );
    }
    const updated = await loadSetRow(userId, setId);
    return toAgentSummary(updated, await loadAggregates(userId, setId));
  },

  /**
   * 结果回流（`GET /api/external/agent/question-sets/{id}/results`，§4.1 的核心）。
   *
   * 只算**该题集自己的作答会话**（`practice_sessions.agent_set_id = setId`）：
   * 同一道题在普通练习里答过不算，否则 Agent 会以为自己推的题被做了。
   * 每题取**最新一条非 skipped 日志**（多次作答看最后一次）；`flagged[]` 单独列出
   * 供 Agent 修正后推新批次。
   */
  async getResults(userId: number, setId: number): Promise<AgentSetResults> {
    await loadSetRow(userId, setId);
    const allRows = await loadSetQuestions(setId);

    const logs = await drizzleDb
      .select({
        questionId: practice_logs.question_id,
        isCorrect: practice_logs.is_correct,
        status: practice_logs.status,
        durationMs: practice_logs.duration_ms,
      })
      .from(practice_logs)
      .innerJoin(
        practice_sessions,
        eq(practice_sessions.id, practice_logs.session_id),
      )
      .where(
        and(
          eq(practice_sessions.user_id, userId),
          eq(practice_sessions.agent_set_id, setId),
        ),
      )
      .orderBy(asc(practice_logs.id));

    // 最新一条非 skipped 日志（id 递增即写入顺序）
    const latest = new Map<
      number,
      { isCorrect: boolean; durationMs: number | null }
    >();
    for (const log of logs) {
      if (log.status === "skipped") continue;
      latest.set(log.questionId, {
        isCorrect: Boolean(log.isCorrect),
        durationMs: log.durationMs ?? null,
      });
    }

    const byId = new Map(allRows.map((row) => [row.id, row]));
    const items: AgentSetResults["items"] = [];
    const tagMap = new Map<string, { answered: number; correct: number }>();
    let answered = 0;
    let correct = 0;
    let totalDuration = 0;

    for (const [questionId, log] of latest) {
      const row = byId.get(questionId);
      // 只算该题集的题（防御历史脏日志：/results 不统计别的批次的题）
      if (!row) continue;
      answered += 1;
      if (log.isCorrect) correct += 1;
      totalDuration += log.durationMs ?? 0;
      for (const tag of safeParseJson<string[]>(row.tags, [])) {
        const bucket = tagMap.get(tag) ?? { answered: 0, correct: 0 };
        bucket.answered += 1;
        if (log.isCorrect) bucket.correct += 1;
        tagMap.set(tag, bucket);
      }
    }

    // items 覆盖该批全部题（含已报错、未作答），顺序同批次内顺序
    for (const row of allRows) {
      const log = latest.get(row.id);
      const flagged = row.origin === "flagged";
      items.push({
        questionId: row.id,
        answered: Boolean(log),
        isCorrect: log?.isCorrect ?? false,
        durationMs: log?.durationMs ?? null,
        flagged,
        flagReason: flagged ? (row.agent_flag_reason ?? null) : null,
      });
    }

    return {
      setId,
      summary: {
        answered,
        total: allRows.length,
        correctRate: answered > 0 ? correct / answered : 0,
        avgDurationMs: answered > 0 ? Math.round(totalDuration / answered) : 0,
        tagBreakdown: [...tagMap.entries()]
          .map(([tag, bucket]) => ({
            tag,
            answered: bucket.answered,
            correctRate:
              bucket.answered > 0 ? bucket.correct / bucket.answered : 0,
          }))
          .sort(
            (a, b) => b.answered - a.answered || a.tag.localeCompare(b.tag),
          ),
      },
      items,
      flagged: allRows
        .filter((row) => row.origin === "flagged")
        .map((row) => ({
          questionId: row.id,
          content: row.content,
          reason: row.agent_flag_reason ?? null,
        })),
    };
  },

  /**
   * 报「这题有问题」：该题移出可用集（`origin='flagged'`）并记录理由。
   *
   * 幂等：重复标记不报错、不覆盖首次理由（Agent 要能看到用户第一次说的原因）。
   */
  async flagQuestion(
    userId: number,
    setId: number,
    questionId: number,
    reason?: string,
  ): Promise<{ questionId: number; flagged: true; remaining: number }> {
    const set = await loadSetRow(userId, setId);
    // 只有 active 的题集能标记：archived 是已归档，promoted 的题已经转正成题库题，
    // 从这里改 origin 会把一道正常题库题打回 flagged（越过"转正不可逆"的边界）。
    if (set.status !== "active") {
      throw new AgentSetStateError(
        setId,
        set.status as AgentSetStatus,
        "标记题目",
      );
    }

    const [question] = await drizzleDb
      .select({ id: questions.id, origin: questions.origin })
      .from(questions)
      .where(
        and(eq(questions.id, questionId), eq(questions.agent_set_id, setId)),
      )
      .limit(1);
    // 题不在这个题集里 → 404（不泄露"题存在但属于别的批次"）
    if (!question) throw new AgentSetNotFoundError(questionId);

    if (question.origin !== "flagged") {
      await drizzleDb
        .update(questions)
        .set({
          origin: "flagged",
          agent_flag_reason: reason?.trim() ? reason.trim() : null,
        })
        .where(
          and(eq(questions.id, questionId), eq(questions.agent_set_id, setId)),
        );
    }

    const [counts] = await drizzleDb
      .select({
        total: sql<number>`count(*)`,
        flagged: sql<number>`sum(CASE WHEN ${questions.origin} = 'flagged' THEN 1 ELSE 0 END)`,
      })
      .from(questions)
      .where(eq(questions.agent_set_id, setId));

    const total = Number(counts?.total ?? 0);
    const flagged = Number(counts?.flagged ?? 0);
    return {
      questionId,
      flagged: true,
      remaining: Math.max(0, total - flagged),
    };
  },

  /**
   * 转正：该批可用题并入正常题库（`origin='import'`），`agent_set_id` 保留
   * （结果回流仍可追溯），题集状态置 `promoted`。
   *
   * 已 flagged 的题**不转正**：它们本来就是坏的，转正只会污染题库。
   */
  async promoteSet(
    userId: number,
    setId: number,
  ): Promise<{ setId: number; promoted: true; promotedCount: number }> {
    const row = await loadSetRow(userId, setId);
    if (row.status !== "active") {
      throw new AgentSetStateError(setId, row.status as AgentSetStatus, "转正");
    }

    const promotedIds = await drizzleDb
      .select({ id: questions.id })
      .from(questions)
      .where(
        and(eq(questions.agent_set_id, setId), eq(questions.origin, "agent")),
      );

    if (promotedIds.length > 0) {
      await drizzleDb
        .update(questions)
        .set({ origin: "import" })
        .where(
          and(eq(questions.agent_set_id, setId), eq(questions.origin, "agent")),
        );

      // 转正后才重建向量索引：Agent 题集题在隔离期不进检索（不污染题库搜索），
      // 转正后必须可被检索到。失败只记 warn —— 转正本身已经成功
      for (const item of promotedIds) {
        void indexQuestion(item.id).catch((err: unknown) => {
          logger.warn(
            { err, questionId: item.id },
            "[AgentSet] 转正后向量索引失败",
          );
        });
      }
    }

    await drizzleDb
      .update(agent_question_sets)
      .set({ status: "promoted" })
      .where(
        and(
          eq(agent_question_sets.id, setId),
          eq(agent_question_sets.user_id, userId),
        ),
      );

    return {
      setId,
      promoted: true,
      promotedCount: promotedIds.length,
    };
  },

  /**
   * 一键成卷（§4.2）：建一张 `exam_papers`（`source='agent'`），题目取该题集
   * **未 flag 的题**（顺序即题集内顺序），返回与试卷详情同形的
   * `{paper, items, lastAttempt}`（§4.3，复用 exam 的 DTO）。
   */
  async createPaperFromSet(
    userId: number,
    setId: number,
    input: {
      title?: string;
      kind?: "fixed" | "timed";
      durationMinutes?: number | null;
    } = {},
  ) {
    const row = await loadSetRow(userId, setId);
    if (row.status !== "active") {
      throw new AgentSetStateError(
        setId,
        row.status as AgentSetStatus,
        "一键成卷",
      );
    }

    const available = await loadUsableAgentQuestions(setId);
    if (available.length === 0) {
      throw new ValidationError("题集没有可用题目（全部被标记或已转正）", {
        code: "agent-set.paper.empty",
        publicMessage: "题集没有可用题目（全部被标记或已转正）",
      });
    }

    const created = await examService.createPaper(userId, {
      title: input.title?.trim() || `${row.title}（成卷）`,
      kind: input.kind ?? (input.durationMinutes ? "timed" : "fixed"),
      durationMinutes: input.durationMinutes ?? null,
      questionIds: available.map((q) => q.id),
      source: "agent",
    });

    // §4.3：与试卷详情同形（含 lastAttempt），直接复用 exam 的读取 DTO，
    // 不在本模块另拼一份（两处拼必然漂移）
    return examService.getPaper(userId, created.paper.id);
  },

  /**
   * 开始练（§4.2）：建 `practice_sessions`（`practice_mode='agent_set'`、
   * `agent_set_id`），返回不含答案的题目。
   *
   * **判分不在这里**：逐题提交复用 `POST /practice/session/{id}/submit`
   * （唯一的判分实现 `checkAnswerCorrectness`），本函数只负责开会话。
   * 幂等：每次调用是一个新的作答会话（练习语义，与 exam 的 attempts 一致）。
   */
  async startAttempt(userId: number, setId: number): Promise<AgentSetAttempt> {
    const row = await loadSetRow(userId, setId);
    if (row.status !== "active") {
      throw new AgentSetStateError(
        setId,
        row.status as AgentSetStatus,
        "开始练习",
      );
    }

    const available = await loadUsableAgentQuestions(setId);
    if (available.length === 0) {
      throw new ValidationError("题集没有可用题目（全部被标记或已转正）", {
        code: "agent-set.attempt.empty",
        publicMessage: "题集没有可用题目（全部被标记或已转正）",
      });
    }

    const sessionId = generateSessionId();
    await drizzleDb.insert(practice_sessions).values({
      id: sessionId,
      user_id: userId,
      total_questions: available.length,
      // 与试卷一致：只存 id 序列，题目内容以 questions 为准
      questions_json: JSON.stringify(available.map((q) => q.id)),
      practice_mode: "agent_set",
      is_demo: 0,
      agent_set_id: setId,
    });

    return {
      sessionId,
      questions: available.map(toConsumerQuestion),
    };
  },
};
