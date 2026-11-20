/**
 * 试卷 / 模考服务（docs/exam-paper-plan.md §1–§4）。
 *
 * ## 为什么复用 practice_sessions / practice_logs
 *
 * 一次作答就是一条 `practice_sessions`（`practice_mode='exam'` + `paper_id`）
 * 加 N 条 `practice_logs`（`origin='exam'`）。错题本、历史、统计、掌握度因此
 * **自动生效**，不需要另写一套学习闭环（§1 的取舍）。
 *
 * ## 判分唯一实现
 *
 * 逐题判分只调用 `checkAnswerCorrectness`（`answer-check.ts`）。这里不做任何
 * 字符串比较的"局部优化" —— 那正是 2026-11 多选题判分事故的成因。
 *
 * ## 幂等
 *
 * 交卷的幂等键是 **sessionId**（上游操作 ID，跨重试稳定）：`exam_submitted_at`
 * 非空即视为已交卷，重复提交**不写库**，从已有 `practice_logs` 重算并回
 * `duplicate:true`。`clientKey` 只作日志/兜底，不作为唯一依据（§4）。
 */

import { drizzleDb } from "@/lib/db";
import {
  practice_sessions,
  practice_logs,
  questions,
  exam_papers,
  exam_paper_items,
  user_mastery,
} from "@/lib/db/drizzle-schema";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { withTransaction, type Executor } from "@/lib/db/executor";
import { checkAnswerCorrectness } from "@/lib/services/answer-check";
import { mapQuestion } from "@/lib/services/practice";
import { generateSessionId } from "@/lib/utils/id";
import logger from "@/lib/logger";
import type { Dimension, Question } from "@/types";

/** 可自动判分的题型（§3 第 4 条：主观题一律排除） */
export const OBJECTIVE_QUESTION_TYPES = [
  "single",
  "multi",
  "truefalse",
  "fill_blank",
] as const;

export type ObjectiveQuestionType = (typeof OBJECTIVE_QUESTION_TYPES)[number];

const DEFAULT_WEIGHTS = { wrong: 0.3, weak: 0.3, fresh: 0.4 };

/** 掌握度低于该值（0–100 口径，见 masteryService）的知识点算"弱项" */
const WEAK_SCORE_THRESHOLD = 60;
/** 参与"弱项"取题的标签上限：取最差的若干个，避免把所有低分 tag 全扫一遍 */
const WEAK_TAG_LIMIT = 15;

const MAX_QUESTIONS_PER_PAPER = 300;

// --- 错误类型（状态码由 AppError.kind 决定，路由统一走 toErrorResponse） ---

/** 试卷不存在**或不属于当前用户**：一律 404，不泄露"这个 id 存在" */
export class ExamPaperNotFoundError extends NotFoundError {
  constructor(paperId: number) {
    super(`试卷不存在：${paperId}`, {
      code: "exam.paper.not-found",
      publicMessage: "试卷不存在",
    });
  }
}

/** 作答会话不存在、不属于当前用户，或不是试卷作答 */
export class ExamAttemptNotFoundError extends NotFoundError {
  constructor(sessionId: string) {
    super(`试卷作答不存在：${sessionId}`, {
      code: "exam.attempt.not-found",
      publicMessage: "试卷作答不存在",
    });
  }
}

/** 试卷已有作答记录：先保留历史，不允许删（409，§2） */
export class PaperHasAttemptsError extends ConflictError {
  constructor(paperId: number, attemptCount: number) {
    super(`试卷已有 ${attemptCount} 次作答，不能删除`, {
      code: "exam.paper.has-attempts",
      publicMessage: "试卷已有作答记录，不能删除",
    });
  }
}

/**
 * 组卷候选不足。
 *
 * 结构化字段随 400 一起返回：`{requested, available, shortfall}`。
 * **不做静默缩水**（§3 第 2 条）—— 少几道题的"模考"比报错更难排查。
 */
export class PaperShortfallError extends ValidationError {
  readonly requested: number;
  readonly available: number;
  readonly shortfall: number;

  constructor(requested: number, available: number) {
    super(`题目不足：需要 ${requested} 道，可用 ${available} 道`, {
      code: "exam.paper.shortfall",
      publicMessage: `题目不足：需要 ${requested} 道，可用 ${available} 道`,
    });
    this.requested = requested;
    this.available = Math.max(0, available);
    this.shortfall = Math.max(0, requested - available);
  }
}

/** 手工组卷时传入的题目 id 不存在 / 不是可自动判分的客观题 */
export class PaperQuestionInvalidError extends ValidationError {
  readonly missingQuestionIds: number[];
  readonly unsupportedQuestionIds: number[];

  constructor(missing: number[], unsupported: number[]) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`不存在的题目：${missing.join(", ")}`);
    if (unsupported.length > 0)
      parts.push(`不是可自动判分的客观题：${unsupported.join(", ")}`);
    super(parts.join("；") || "试卷题目不合法", {
      code: "exam.paper.invalid-questions",
      publicMessage: parts.join("；") || "试卷题目不合法",
    });
    this.missingQuestionIds = missing;
    this.unsupportedQuestionIds = unsupported;
  }
}

// --- 对外类型 ---

export interface ExamPaperSummary {
  id: number;
  title: string;
  kind: "fixed" | "timed";
  durationMinutes: number | null;
  source: "manual" | "auto";
  totalQuestions: number;
  createdAt: string | null;
  updatedAt: string | null;
  attemptCount: number;
  bestScore: number | null;
  lastAttemptAt: string | null;
}

/** 契约 §2 约定的 question 形状 */
export interface ExamQuestionPayload {
  id: number;
  content: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
  dimension: string | null;
  type: string | null;
  material: string | null;
}

export interface ExamAttemptSummary {
  sessionId: string;
  paperId: number | null;
  deadlineAt: string | null;
  submittedAt: string | null;
  score: number | null;
  correctCount: number;
  totalQuestions: number;
  createdAt: string | null;
}

export interface CreatePaperInput {
  title: string;
  kind?: "fixed" | "timed";
  durationMinutes?: number | null;
  questionIds: number[];
}

export interface UpdatePaperInput {
  title?: string;
  kind?: "fixed" | "timed";
  durationMinutes?: number | null;
}

export interface GeneratePaperRules {
  title: string;
  kind?: "fixed" | "timed";
  durationMinutes?: number | null;
  count: number;
  tags?: string[];
  dimensions?: string[];
  types?: string[];
  excludeRecentDays?: number;
  weights?: Partial<{ wrong: number; weak: number; fresh: number }>;
}

export interface ExamAnswerInput {
  questionId: number;
  userAnswer?: string | null;
  durationMs?: number | null;
}

export interface ExamPerQuestionResult {
  questionId: number;
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
}

export interface ExamSubmitResult {
  score: number;
  correctCount: number;
  totalQuestions: number;
  durationMs: number;
  overtimeMs: number;
  overtime: boolean;
  duplicate: boolean;
  perQuestion: ExamPerQuestionResult[];
}

export interface ExamAttemptDetail {
  sessionId: string;
  paper: ExamPaperSummary;
  deadlineAt: string | null;
  submittedAt: string | null;
  questions: ExamQuestionPayload[];
  /** 已交卷时才有：本次作答的每条日志（含未作答的 skipped） */
  answers?: Array<{
    questionId: number;
    userAnswer: string;
    isCorrect: boolean;
    status: string;
    durationMs: number;
  }>;
  /** 已交卷时才有：与 POST /submit 同一形状（duplicate 恒为 false） */
  result?: ExamSubmitResult;
}

// --- 纯函数辅助 ---

function toQuestionPayload(q: Question, hideAnswer: boolean): ExamQuestionPayload {
  return {
    id: q.id,
    content: q.content,
    options: q.options ?? [],
    // 防作弊：未交卷时答案与解析都置空（解析里基本都含答案）
    answer: hideAnswer ? "" : (q.answer ?? ""),
    explanation: hideAnswer ? "" : (q.explanation ?? ""),
    tags: q.tags ?? [],
    dimension: q.dimension ?? null,
    type: q.type ?? null,
    material: q.material ?? null,
  };
}

function toPaperSummary(
  row: typeof exam_papers.$inferSelect,
  stats?: { attemptCount?: number; bestScore?: number | null; lastAttemptAt?: string | null },
): ExamPaperSummary {
  return {
    id: row.id,
    title: row.title,
    kind: (row.kind as "fixed" | "timed") ?? "fixed",
    durationMinutes: row.duration_minutes ?? null,
    source: (row.source as "manual" | "auto") ?? "manual",
    totalQuestions: row.total_questions ?? 0,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    attemptCount: stats?.attemptCount ?? 0,
    bestScore: stats?.bestScore ?? null,
    lastAttemptAt: stats?.lastAttemptAt ?? null,
  };
}

/**
 * 校验并补齐 kind / durationMinutes 的组合约束：
 * `fixed` 强制不限时；`timed` 必须给正数分钟（§1 的列注释）。
 */
function resolveTiming(
  kind: string,
  durationMinutes: number | null | undefined,
): { kind: "fixed" | "timed"; durationMinutes: number | null } {
  if (kind !== "fixed" && kind !== "timed") {
    throw new ValidationError("kind 只能是 fixed 或 timed", {
      code: "exam.paper.invalid-kind",
      publicMessage: "kind 只能是 fixed 或 timed",
    });
  }
  if (kind === "fixed") return { kind, durationMinutes: null };
  if (
    durationMinutes === null ||
    durationMinutes === undefined ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    throw new ValidationError("限时卷必须提供正整数 durationMinutes", {
      code: "exam.paper.invalid-duration",
      publicMessage: "限时卷必须提供 durationMinutes（分钟）",
    });
  }
  return { kind, durationMinutes: Math.floor(durationMinutes) };
}

function normalizeWeights(
  input?: Partial<{ wrong: number; weak: number; fresh: number }>,
): { wrong: number; weak: number; fresh: number } {
  const merged = { ...DEFAULT_WEIGHTS, ...(input ?? {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new ValidationError(`weights.${key} 必须是非负数`, {
        code: "exam.paper.invalid-weights",
        publicMessage: `weights.${key} 必须是非负数`,
      });
    }
  }
  const sum = merged.wrong + merged.weak + merged.fresh;
  if (sum <= 0) {
    throw new ValidationError("weights 之和必须大于 0", {
      code: "exam.paper.invalid-weights",
      publicMessage: "weights 之和必须大于 0",
    });
  }
  return {
    wrong: merged.wrong / sum,
    weak: merged.weak / sum,
    fresh: merged.fresh / sum,
  };
}

/** 客观题过滤：未传 types 时只出客观题，传了也必须在允许集合里（§3 第 4 条） */
function resolveTypes(types?: string[]): ObjectiveQuestionType[] {
  if (!types || types.length === 0) return [...OBJECTIVE_QUESTION_TYPES];
  const allowed = new Set<string>(OBJECTIVE_QUESTION_TYPES);
  const invalid = types.filter((t) => !allowed.has(t));
  if (invalid.length > 0) {
    throw new ValidationError(
      `这些题型不能进试卷（只允许客观题）：${invalid.join(", ")}`,
      {
        code: "exam.paper.invalid-types",
        publicMessage: `这些题型不能进试卷（只允许客观题）：${invalid.join(", ")}`,
      },
    );
  }
  return types as ObjectiveQuestionType[];
}

/** 标签过滤：json_each 精确比对（与 practice.createTagSession 同口径） */
function anyTagCondition(tags?: string[]): SQL | undefined {
  if (!tags || tags.length === 0) return undefined;
  const conditions = tags.map(
    (tag) => sql`EXISTS (SELECT 1 FROM json_each(${questions.tags}) WHERE value = ${tag})`,
  );
  return or(...conditions);
}

function stripEmptyStrings(values?: string[]): string[] | undefined {
  if (!values) return undefined;
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

// --- 内部读取辅助 ---

async function loadPaperRow(
  userId: number,
  paperId: number,
  exec: Executor = drizzleDb,
) {
  const [row] = await exec
    .select()
    .from(exam_papers)
    .where(and(eq(exam_papers.id, paperId), eq(exam_papers.user_id, userId)))
    .limit(1);
  return row ?? null;
}

/** 试卷的题目（按 position 升序），返回业务 Question 列表 */
async function loadPaperQuestions(
  paperId: number,
  exec: Executor = drizzleDb,
): Promise<Question[]> {
  const rows = await exec
    .select({ position: exam_paper_items.position, question: questions })
    .from(exam_paper_items)
    .innerJoin(questions, eq(questions.id, exam_paper_items.question_id))
    .where(eq(exam_paper_items.paper_id, paperId))
    .orderBy(asc(exam_paper_items.position));
  return rows.map((r) => mapQuestion(r.question));
}

async function attemptStats(userId: number, paperId: number) {
  const [row] = await drizzleDb
    .select({
      attemptCount: sql<number>`count(*)`,
      bestScore: sql<number | null>`max(${practice_sessions.exam_score})`,
      lastAttemptAt: sql<string | null>`max(${practice_sessions.created_at})`,
    })
    .from(practice_sessions)
    .where(
      and(
        eq(practice_sessions.user_id, userId),
        eq(practice_sessions.paper_id, paperId),
      ),
    );
  return {
    attemptCount: Number(row?.attemptCount ?? 0),
    bestScore: row?.bestScore === null ? null : Number(row?.bestScore),
    lastAttemptAt: row?.lastAttemptAt ?? null,
  };
}

/** 交卷结果汇总（GET 结果态 / 重复提交重放共用） */
function summarize(
  graded: ExamPerQuestionResult[],
  durations: number[],
  submittedAtMs: number,
  deadlineAt: string | null,
  duplicate: boolean,
): ExamSubmitResult {
  const totalQuestions = graded.length;
  const correctCount = graded.filter((g) => g.isCorrect).length;
  const durationMs = durations.reduce((sum, d) => sum + d, 0);
  const deadlineMs = deadlineAt ? Date.parse(deadlineAt) : NaN;
  const overtimeMs = Number.isFinite(deadlineMs)
    ? Math.max(0, submittedAtMs - deadlineMs)
    : 0;
  return {
    score: totalQuestions > 0 ? correctCount / totalQuestions : 0,
    correctCount,
    totalQuestions,
    durationMs,
    overtimeMs,
    overtime: overtimeMs > 0,
    duplicate,
    perQuestion: graded,
  };
}

/** 从已有 practice_logs 重算结果（幂等重放，§4） */
async function resultFromLogs(
  sessionId: string,
  paperQuestions: Question[],
  deadlineAt: string | null,
  submittedAt: string | null,
  duplicate: boolean,
): Promise<ExamSubmitResult> {
  const logs = await drizzleDb
    .select({
      question_id: practice_logs.question_id,
      is_correct: practice_logs.is_correct,
      status: practice_logs.status,
      duration_ms: practice_logs.duration_ms,
    })
    .from(practice_logs)
    .where(eq(practice_logs.session_id, sessionId));

  // 同一题理论上只有一条（交卷一次批量写），仍然按最后一条取，防御历史脏数据
  const byQuestion = new Map<number, (typeof logs)[number]>();
  for (const log of logs) byQuestion.set(log.question_id, log);

  const graded: ExamPerQuestionResult[] = paperQuestions.map((q) => {
    const log = byQuestion.get(q.id);
    return {
      questionId: q.id,
      // skipped 的日志 is_correct=0，不会污染正确数
      isCorrect: Boolean(log?.is_correct) && log?.status !== "skipped",
      correctAnswer: q.answer ?? "",
      explanation: q.explanation ?? "",
    };
  });
  const durations = paperQuestions.map((q) => Number(byQuestion.get(q.id)?.duration_ms ?? 0));
  const submittedAtMs = submittedAt ? Date.parse(submittedAt) : Date.now();
  return summarize(graded, durations, submittedAtMs, deadlineAt, duplicate);
}

// --- 服务 ---

export const examService = {
  /** 试卷列表（含作答统计） */
  async listPapers(
    userId: number,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ papers: ExamPaperSummary[]; total: number }> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const rows = await drizzleDb
      .select()
      .from(exam_papers)
      .where(eq(exam_papers.user_id, userId))
      .orderBy(desc(exam_papers.created_at), desc(exam_papers.id))
      .limit(limit)
      .offset(offset);

    const [countRow] = await drizzleDb
      .select({ total: sql<number>`count(*)` })
      .from(exam_papers)
      .where(eq(exam_papers.user_id, userId));

    if (rows.length === 0) {
      return { papers: [], total: Number(countRow?.total ?? 0) };
    }

    // 一次聚合全部作答统计，避免 N+1
    const stats = await drizzleDb
      .select({
        paperId: practice_sessions.paper_id,
        attemptCount: sql<number>`count(*)`,
        bestScore: sql<number | null>`max(${practice_sessions.exam_score})`,
        lastAttemptAt: sql<string | null>`max(${practice_sessions.created_at})`,
      })
      .from(practice_sessions)
      .where(
        and(
          eq(practice_sessions.user_id, userId),
          inArray(
            practice_sessions.paper_id,
            rows.map((r) => r.id),
          ),
        ),
      )
      .groupBy(practice_sessions.paper_id);

    const statsByPaper = new Map(
      stats
        .filter((s) => s.paperId !== null)
        .map((s) => [
          Number(s.paperId),
          {
            attemptCount: Number(s.attemptCount ?? 0),
            bestScore: s.bestScore === null ? null : Number(s.bestScore),
            lastAttemptAt: s.lastAttemptAt ?? null,
          },
        ]),
    );

    return {
      papers: rows.map((row) => toPaperSummary(row, statsByPaper.get(row.id))),
      total: Number(countRow?.total ?? 0),
    };
  },

  /** 手工组卷（§2 POST /papers）：questionIds 去重、必须全部存在且为客观题 */
  async createPaper(
    userId: number,
    input: CreatePaperInput,
  ): Promise<{ paper: ExamPaperSummary; items: Array<{ position: number; questionId: number }> }> {
    const title = (input.title ?? "").trim();
    if (!title) {
      throw new ValidationError("title 不能为空", {
        code: "exam.paper.invalid-title",
        publicMessage: "title 不能为空",
      });
    }

    const timing = resolveTiming(input.kind ?? "fixed", input.durationMinutes);

    // 去重但保留用户给定顺序（顺序就是答题顺序）
    const questionIds = [...new Set(input.questionIds)];
    if (questionIds.length === 0) {
      throw new ValidationError("questionIds 不能为空", {
        code: "exam.paper.empty-questions",
        publicMessage: "questionIds 不能为空",
      });
    }
    if (questionIds.length > MAX_QUESTIONS_PER_PAPER) {
      throw new ValidationError(
        `一张试卷最多 ${MAX_QUESTIONS_PER_PAPER} 道题`,
        {
          code: "exam.paper.too-many-questions",
          publicMessage: `一张试卷最多 ${MAX_QUESTIONS_PER_PAPER} 道题`,
        },
      );
    }

    const found = await drizzleDb
      .select({ id: questions.id, type: questions.type })
      .from(questions)
      .where(inArray(questions.id, questionIds));
    const foundById = new Map(found.map((q) => [q.id, q]));

    const missing = questionIds.filter((id) => !foundById.has(id));
    const unsupported = questionIds.filter((id) => {
      const row = foundById.get(id);
      if (!row) return false;
      return !(OBJECTIVE_QUESTION_TYPES as readonly string[]).includes(
        row.type ?? "",
      );
    });
    if (missing.length > 0 || unsupported.length > 0) {
      throw new PaperQuestionInvalidError(missing, unsupported);
    }

    const paperId = await withTransaction(async (exec) => {
      const [inserted] = await exec
        .insert(exam_papers)
        .values({
          user_id: userId,
          title,
          kind: timing.kind,
          duration_minutes: timing.durationMinutes,
          source: "manual",
          rules_json: null,
          total_questions: questionIds.length,
        })
        .returning({ id: exam_papers.id });

      await exec.insert(exam_paper_items).values(
        questionIds.map((questionId, index) => ({
          paper_id: inserted.id,
          question_id: questionId,
          position: index + 1,
        })),
      );

      return inserted.id;
    });

    const row = await loadPaperRow(userId, paperId);
    if (!row) throw new ExamPaperNotFoundError(paperId);

    return {
      paper: toPaperSummary(row, { attemptCount: 0, bestScore: null, lastAttemptAt: null }),
      items: questionIds.map((questionId, index) => ({
        position: index + 1,
        questionId,
      })),
    };
  },

  /** 试卷详情（§2 GET /papers/{id}）：items 带完整题目（含答案），另附最近一次作答 */
  async getPaper(userId: number, paperId: number): Promise<{
    paper: ExamPaperSummary;
    items: Array<{ position: number; question: ExamQuestionPayload }>;
    lastAttempt: ExamAttemptSummary | null;
  }> {
    const row = await loadPaperRow(userId, paperId);
    if (!row) throw new ExamPaperNotFoundError(paperId);

    const items = await drizzleDb
      .select({ position: exam_paper_items.position, question: questions })
      .from(exam_paper_items)
      .innerJoin(questions, eq(questions.id, exam_paper_items.question_id))
      .where(eq(exam_paper_items.paper_id, paperId))
      .orderBy(asc(exam_paper_items.position));

    const [last] = await drizzleDb
      .select()
      .from(practice_sessions)
      .where(
        and(
          eq(practice_sessions.user_id, userId),
          eq(practice_sessions.paper_id, paperId),
        ),
      )
      .orderBy(desc(practice_sessions.created_at))
      .limit(1);

    return {
      paper: toPaperSummary(row, await attemptStats(userId, paperId)),
      items: items.map((item) => ({
        position: item.position,
        // 详情只有试卷所有者能看，仍按契约返回 answer（§2 只在作答态置空）
        question: toQuestionPayload(mapQuestion(item.question), false),
      })),
      lastAttempt: last
        ? {
            sessionId: last.id,
            paperId: last.paper_id ?? null,
            deadlineAt: last.deadline_at ?? null,
            submittedAt: last.exam_submitted_at ?? null,
            score: last.exam_score ?? null,
            correctCount: last.correct_count ?? 0,
            totalQuestions: last.total_questions ?? 0,
            createdAt: last.created_at ?? null,
          }
        : null,
    };
  },

  /** 修改试卷元信息（§2 PATCH：不含题目编辑，MVP） */
  async updatePaper(
    userId: number,
    paperId: number,
    input: UpdatePaperInput,
  ): Promise<ExamPaperSummary> {
    const row = await loadPaperRow(userId, paperId);
    if (!row) throw new ExamPaperNotFoundError(paperId);

    const nextKind = input.kind ?? (row.kind as "fixed" | "timed");
    const timing = resolveTiming(
      nextKind,
      input.durationMinutes !== undefined
        ? input.durationMinutes
        : row.duration_minutes,
    );

    const title = input.title !== undefined ? input.title.trim() : row.title;
    if (!title) {
      throw new ValidationError("title 不能为空", {
        code: "exam.paper.invalid-title",
        publicMessage: "title 不能为空",
      });
    }

    await drizzleDb
      .update(exam_papers)
      .set({
        title,
        kind: timing.kind,
        duration_minutes: timing.durationMinutes,
        updated_at: sql`CURRENT_TIMESTAMP`,
      })
      .where(and(eq(exam_papers.id, paperId), eq(exam_papers.user_id, userId)));

    const updated = await loadPaperRow(userId, paperId);
    if (!updated) throw new ExamPaperNotFoundError(paperId);
    return toPaperSummary(updated, await attemptStats(userId, paperId));
  },

  /** 删除试卷（§2：已有作答返回 409，先保留历史） */
  async deletePaper(userId: number, paperId: number): Promise<{ deleted: true }> {
    const row = await loadPaperRow(userId, paperId);
    if (!row) throw new ExamPaperNotFoundError(paperId);

    const stats = await attemptStats(userId, paperId);
    if (stats.attemptCount > 0) {
      throw new PaperHasAttemptsError(paperId, stats.attemptCount);
    }

    await withTransaction(async (exec) => {
      // items 由外键 ON DELETE CASCADE 清理（§1）
      await exec
        .delete(exam_papers)
        .where(
          and(eq(exam_papers.id, paperId), eq(exam_papers.user_id, userId)),
        );
    });

    return { deleted: true };
  },

  /**
   * 自动组卷（§3）。
   *
   * 三段权重 —— `wrong`（做错过）/ `weak`（掌握度低的知识点）/ `fresh`（没做过）——
   * 各按 `floor(count × 归一化权重)` 取配额，按 wrong → weak → fresh 顺序抽样并
   * 去重；某段候选不够时，从**剩余候选池**随机补足（不重复取已选中的题）。
   * 总候选数不足 `count` 时抛 `PaperShortfallError`，不静默缩水。
   */
  async generatePaper(
    userId: number,
    rules: GeneratePaperRules,
  ): Promise<{
    paper: ExamPaperSummary;
    rules: GeneratePaperRules & { weights: { wrong: number; weak: number; fresh: number } };
    items: Array<{ position: number; questionId: number }>;
  }> {
    const title = (rules.title ?? "").trim();
    if (!title) {
      throw new ValidationError("title 不能为空", {
        code: "exam.paper.invalid-title",
        publicMessage: "title 不能为空",
      });
    }

    const timing = resolveTiming(
      rules.kind ?? (rules.durationMinutes ? "timed" : "fixed"),
      rules.durationMinutes,
    );

    const count = Math.floor(Number(rules.count));
    if (!Number.isFinite(count) || count <= 0) {
      throw new ValidationError("count 必须是正整数", {
        code: "exam.paper.invalid-count",
        publicMessage: "count 必须是正整数",
      });
    }
    if (count > MAX_QUESTIONS_PER_PAPER) {
      throw new ValidationError(
        `一张试卷最多 ${MAX_QUESTIONS_PER_PAPER} 道题`,
        {
          code: "exam.paper.too-many-questions",
          publicMessage: `一张试卷最多 ${MAX_QUESTIONS_PER_PAPER} 道题`,
        },
      );
    }

    const tags = stripEmptyStrings(rules.tags);
    const dimensions = stripEmptyStrings(rules.dimensions);
    const types = resolveTypes(rules.types);
    const weights = normalizeWeights(rules.weights);
    const excludeRecentDays =
      rules.excludeRecentDays && rules.excludeRecentDays > 0
        ? Math.floor(rules.excludeRecentDays)
        : 0;

    // 所有段共享的候选条件
    const baseConditions: SQL[] = [
      inArray(questions.type, types) as SQL,
    ];
    const tagCondition = anyTagCondition(tags);
    if (tagCondition) baseConditions.push(tagCondition);
    if (dimensions && dimensions.length > 0) {
      baseConditions.push(
        inArray(questions.dimension, dimensions as Dimension[]),
      );
    }
    if (excludeRecentDays > 0) {
      const window = `-${excludeRecentDays} days`;
      baseConditions.push(
        sql`NOT EXISTS (SELECT 1 FROM practice_logs pl
              WHERE pl.user_id = ${userId}
                AND pl.question_id = ${questions.id}
                AND pl.timestamp >= datetime('now', ${window}))`,
      );
    }

    const [availableRow] = await drizzleDb
      .select({ total: sql<number>`count(*)` })
      .from(questions)
      .where(and(...baseConditions));
    const available = Number(availableRow?.total ?? 0);
    if (available < count) throw new PaperShortfallError(count, available);

    // --- 三段候选池 ---
    const wrongCondition = sql`EXISTS (SELECT 1 FROM practice_logs pl
        WHERE pl.user_id = ${userId}
          AND pl.question_id = ${questions.id}
          AND pl.is_correct = 0
          AND pl.status != 'skipped')`;
    const freshCondition = sql`NOT EXISTS (SELECT 1 FROM practice_logs pl
        WHERE pl.user_id = ${userId} AND pl.question_id = ${questions.id})`;

    // 弱项 = 掌握度低于阈值的 tag 下的题（最差的若干个 tag）
    const weakTags = await drizzleDb
      .select({ tag: user_mastery.tag_name })
      .from(user_mastery)
      .where(
        and(
          eq(user_mastery.user_id, userId),
          gt(user_mastery.total_count, 0),
          lt(user_mastery.score, WEAK_SCORE_THRESHOLD),
        ),
      )
      .orderBy(asc(user_mastery.score))
      .limit(WEAK_TAG_LIMIT);
    const weakTagNames = weakTags.map((t) => t.tag).filter(Boolean);
    const weakCondition: SQL | undefined =
      weakTagNames.length > 0 ? anyTagCondition(weakTagNames) : undefined;

    const sampled: number[] = [];
    const sampleFrom = async (
      extra: SQL | undefined,
      limit: number,
    ): Promise<void> => {
      if (limit <= 0) return;
      const conditions = extra
        ? [...baseConditions, extra]
        : [...baseConditions];
      if (sampled.length > 0) {
        conditions.push(notInArray(questions.id, sampled) as unknown as SQL);
      }
      const rows = await drizzleDb
        .select({ id: questions.id })
        .from(questions)
        .where(and(...conditions))
        .orderBy(sql`RANDOM()`)
        .limit(limit);
      for (const row of rows) sampled.push(row.id);
    };

    const wrongQuota = Math.floor(count * weights.wrong);
    const weakQuota = Math.floor(count * weights.weak);
    // 余数全部给 fresh：避免 floor 丢题导致"权重对了但总数少了"
    const freshQuota = count - wrongQuota - weakQuota;

    await sampleFrom(wrongCondition, wrongQuota);
    await sampleFrom(weakCondition, weakQuota);
    await sampleFrom(freshCondition, freshQuota);

    // 去重后不足：从剩余候选池随机补足
    if (sampled.length < count) {
      await sampleFrom(undefined, count - sampled.length);
    }
    if (sampled.length < count) {
      // 理论上不可达（available ≥ count）；防御并发删题后静默缩水
      throw new PaperShortfallError(count, sampled.length);
    }

    const questionIds = sampled.slice(0, count);
    const rulesSnapshot: GeneratePaperRules & {
      weights: { wrong: number; weak: number; fresh: number };
    } = {
      title,
      kind: timing.kind,
      durationMinutes: timing.durationMinutes,
      count,
      tags,
      dimensions,
      types,
      excludeRecentDays,
      weights,
    };

    const paperId = await withTransaction(async (exec) => {
      const [inserted] = await exec
        .insert(exam_papers)
        .values({
          user_id: userId,
          title,
          kind: timing.kind,
          duration_minutes: timing.durationMinutes,
          source: "auto",
          rules_json: JSON.stringify(rulesSnapshot),
          total_questions: questionIds.length,
        })
        .returning({ id: exam_papers.id });

      await exec.insert(exam_paper_items).values(
        questionIds.map((questionId, index) => ({
          paper_id: inserted.id,
          question_id: questionId,
          position: index + 1,
        })),
      );

      return inserted.id;
    });

    const row = await loadPaperRow(userId, paperId);
    if (!row) throw new ExamPaperNotFoundError(paperId);

    return {
      paper: toPaperSummary(row, {
        attemptCount: 0,
        bestScore: null,
        lastAttemptAt: null,
      }),
      rules: rulesSnapshot,
      items: questionIds.map((questionId, index) => ({
        position: index + 1,
        questionId,
      })),
    };
  },

  /** 开始作答（§2 POST /papers/{id}/attempts）：建 exam 会话，返回题目（答案置空） */
  async startAttempt(
    userId: number,
    paperId: number,
  ): Promise<{
    sessionId: string;
    paperId: number;
    deadlineAt: string | null;
    questions: ExamQuestionPayload[];
  }> {
    const paper = await loadPaperRow(userId, paperId);
    if (!paper) throw new ExamPaperNotFoundError(paperId);

    const paperQuestions = await loadPaperQuestions(paperId);
    if (paperQuestions.length === 0) {
      throw new ValidationError("试卷没有题目，无法开始作答", {
        code: "exam.paper.empty",
        publicMessage: "试卷没有题目，无法开始作答",
      });
    }

    const deadlineAt =
      paper.kind === "timed" && paper.duration_minutes
        ? new Date(Date.now() + paper.duration_minutes * 60_000).toISOString()
        : null;

    const sessionId = generateSessionId();
    await drizzleDb.insert(practice_sessions).values({
      id: sessionId,
      user_id: userId,
      total_questions: paperQuestions.length,
      // 只存题目 id 序列：题目内容以 exam_paper_items 为准（改题回刷后判分一致），
      // 也避免把 answer 复制到 session 快照里
      questions_json: JSON.stringify(paperQuestions.map((q) => q.id)),
      practice_mode: "exam",
      is_demo: 0,
      paper_id: paperId,
      deadline_at: deadlineAt,
    });

    return {
      sessionId,
      paperId,
      deadlineAt,
      questions: paperQuestions.map((q) => toQuestionPayload(q, true)),
    };
  },

  /**
   * 交卷（§4）。
   *
   * 幂等：`exam_submitted_at` 非空 → 不写库，从已有 logs 重算并回 `duplicate:true`。
   * 事务内再读一次会话行，避免并发双击同时通过"未交卷"检查。
   */
  async submitAttempt(
    userId: number,
    sessionId: string,
    answers: ExamAnswerInput[],
    clientKey?: string,
  ): Promise<ExamSubmitResult> {
    const [session] = await drizzleDb
      .select()
      .from(practice_sessions)
      .where(
        and(
          eq(practice_sessions.id, sessionId),
          eq(practice_sessions.user_id, userId),
        ),
      )
      .limit(1);

    // 不存在 / 不属于当前用户 / 不是试卷作答：一律 404
    if (!session || session.paper_id === null || session.paper_id === undefined) {
      throw new ExamAttemptNotFoundError(sessionId);
    }

    const paperId = session.paper_id;
    const paper = await loadPaperRow(userId, paperId);
    if (!paper) throw new ExamPaperNotFoundError(paperId);

    const paperQuestions = await loadPaperQuestions(paperId);

    // --- 幂等重放路径：不写库 ---
    if (session.exam_submitted_at) {
      logger.info(
        { userId, sessionId, clientKey, paperId },
        "[Exam] 重复交卷命中幂等，按已有日志重算",
      );
      return resultFromLogs(
        sessionId,
        paperQuestions,
        session.deadline_at ?? null,
        session.exam_submitted_at,
        true,
      );
    }

    // 答案按 questionId 建索引：重复项取最后一条（客户端重试可能追加）
    const answerByQuestion = new Map<number, ExamAnswerInput>();
    for (const answer of answers) {
      answerByQuestion.set(answer.questionId, answer);
    }

    const now = new Date();
    const submittedAt = now.toISOString();

    const graded = paperQuestions.map((q) => {
      const raw = answerByQuestion.get(q.id);
      const userAnswer = raw?.userAnswer ?? "";
      const skipped = userAnswer.trim() === "";
      const durationMs = Math.max(0, Math.floor(Number(raw?.durationMs ?? 0)) || 0);
      const isCorrect = skipped
        ? false
        : checkAnswerCorrectness(
            userAnswer,
            q.answer ?? "",
            q.options ?? [],
            q.type ?? undefined,
          );
      return {
        question: q,
        userAnswer,
        durationMs,
        isCorrect,
        skipped,
      };
    });

    const outcome = await withTransaction(async (exec) => {
      // 事务内复读：挡住并发双击（两个请求都通过上面的检查）
      const [current] = await exec
        .select({
          submittedAt: practice_sessions.exam_submitted_at,
          deadlineAt: practice_sessions.deadline_at,
        })
        .from(practice_sessions)
        .where(
          and(
            eq(practice_sessions.id, sessionId),
            eq(practice_sessions.user_id, userId),
          ),
        )
        .limit(1);
      if (!current) throw new ExamAttemptNotFoundError(sessionId);
      if (current.submittedAt) return { written: false as const };

      // 一次批量插入：practice_logs 是最大表，逐条提交会拖长写事务（§7）
      await exec.insert(practice_logs).values(
        graded.map((item) => ({
          session_id: sessionId,
          user_id: userId,
          question_id: item.question.id,
          user_answer: item.userAnswer,
          is_correct: item.isCorrect,
          duration_ms: item.durationMs,
          origin: "exam",
          // 未作答 = skipped：不进 FSRS/掌握度（沿用现有语义，§1）
          status: item.skipped ? "skipped" : "answered",
        })),
      );

      const correctCount = graded.filter((item) => item.isCorrect).length;
      const totalDurationMs = graded.reduce(
        (sum, item) => sum + item.durationMs,
        0,
      );

      await exec
        .update(practice_sessions)
        .set({
          total_questions: graded.length,
          correct_count: correctCount,
          total_duration_ms: totalDurationMs,
          exam_score: graded.length > 0 ? correctCount / graded.length : 0,
          exam_submitted_at: submittedAt,
        })
        .where(
          and(
            eq(practice_sessions.id, sessionId),
            eq(practice_sessions.user_id, userId),
          ),
        );

      return { written: true as const };
    });

    if (!outcome.written) {
      // 并发对手先写完：按同一幂等语义重算（本次不写库）
      const [row] = await drizzleDb
        .select({ submittedAt: practice_sessions.exam_submitted_at })
        .from(practice_sessions)
        .where(eq(practice_sessions.id, sessionId))
        .limit(1);
      return resultFromLogs(
        sessionId,
        paperQuestions,
        session.deadline_at ?? null,
        row?.submittedAt ?? submittedAt,
        true,
      );
    }

    // 学习闭环副作用：掌握度 + FSRS（skip 的题不参与）
    await applyLearningEffects(userId, graded);

    const result = summarize(
      graded.map((item) => ({
        questionId: item.question.id,
        isCorrect: item.isCorrect,
        correctAnswer: item.question.answer ?? "",
        explanation: item.question.explanation ?? "",
      })),
      graded.map((item) => item.durationMs),
      now.getTime(),
      session.deadline_at ?? null,
      false,
    );

    logger.info(
      {
        userId,
        sessionId,
        paperId,
        clientKey,
        correctCount: result.correctCount,
        totalQuestions: result.totalQuestions,
        overtimeMs: result.overtimeMs,
      },
      "[Exam] 交卷完成",
    );

    return result;
  },

  /** 作答态 / 结果态（§2 GET /attempts/{sessionId}） */
  async getAttempt(
    userId: number,
    sessionId: string,
  ): Promise<ExamAttemptDetail> {
    const [session] = await drizzleDb
      .select()
      .from(practice_sessions)
      .where(
        and(
          eq(practice_sessions.id, sessionId),
          eq(practice_sessions.user_id, userId),
        ),
      )
      .limit(1);

    if (
      !session ||
      session.paper_id === null ||
      session.paper_id === undefined
    ) {
      throw new ExamAttemptNotFoundError(sessionId);
    }

    const paper = await loadPaperRow(userId, session.paper_id);
    if (!paper) throw new ExamPaperNotFoundError(session.paper_id);

    const paperQuestions = await loadPaperQuestions(session.paper_id);
    const submitted = Boolean(session.exam_submitted_at);

    const detail: ExamAttemptDetail = {
      sessionId,
      paper: toPaperSummary(paper, await attemptStats(userId, paper.id)),
      deadlineAt: session.deadline_at ?? null,
      submittedAt: session.exam_submitted_at ?? null,
      // 未交卷：answer / explanation 一律置空（防作弊，§2）
      questions: paperQuestions.map((q) => toQuestionPayload(q, !submitted)),
    };

    if (!submitted) return detail;

    const logs = await drizzleDb
      .select({
        questionId: practice_logs.question_id,
        userAnswer: practice_logs.user_answer,
        isCorrect: practice_logs.is_correct,
        status: practice_logs.status,
        durationMs: practice_logs.duration_ms,
      })
      .from(practice_logs)
      .where(eq(practice_logs.session_id, sessionId))
      .orderBy(asc(practice_logs.id));

    const byQuestion = new Map<number, (typeof logs)[number]>();
    for (const log of logs) byQuestion.set(log.questionId, log);

    detail.answers = paperQuestions.map((q) => {
      const log = byQuestion.get(q.id);
      return {
        questionId: q.id,
        userAnswer: log?.userAnswer ?? "",
        isCorrect: Boolean(log?.isCorrect),
        status: log?.status ?? "skipped",
        durationMs: Number(log?.durationMs ?? 0),
      };
    });

    detail.result = await resultFromLogs(
      sessionId,
      paperQuestions,
      session.deadline_at ?? null,
      session.exam_submitted_at,
      false,
    );

    return detail;
  },
};

/**
 * 交卷后的学习闭环副作用（掌握度 + FSRS）。
 *
 * 失败只记结构化日志：交卷结果已经落库，不能让"掌握度聚合失败"把用户刚做完的
 * 一整场模考变成 500（§1 的承诺是结果落库即生效，聚合是派生数据）。
 */
async function applyLearningEffects(
  userId: number,
  graded: Array<{
    question: Question;
    isCorrect: boolean;
    durationMs: number;
    skipped: boolean;
  }>,
): Promise<void> {
  const answered = graded.filter((item) => !item.skipped);

  if (answered.length > 0) {
    try {
      const { masteryService } = await import("@/lib/services/mastery");
      for (const item of answered) {
        for (const tag of item.question.tags ?? []) {
          await masteryService.updateMastery(
            userId,
            tag,
            (item.question.dimension ?? "knowledge") as Dimension,
            item.isCorrect,
          );
        }
      }
    } catch (err) {
      logger.error(
        { err, userId, questionCount: answered.length },
        "[Exam] 掌握度更新失败（交卷结果已落库）",
      );
      // 显式降级：掌握度是派生数据，失败不影响交卷结果，也不再继续打 FSRS
      return;
    }
  }

  if (answered.length === 0) return;

  try {
    const { srsService } = await import("@/lib/services/srs");
    for (const item of answered) {
      try {
        await srsService.updateQuestionSrs(
          userId,
          item.question.id,
          item.isCorrect,
          item.durationMs,
        );
      } catch (err) {
        logger.error(
          { err, userId, questionId: item.question.id },
          "[Exam] 单题 FSRS 更新失败（交卷结果已落库）",
        );
        // 显式降级：单题失败不阻断其余题目的排期
        continue;
      }
    }
  } catch (err) {
    logger.error({ err, userId }, "[Exam] FSRS 更新失败（交卷结果已落库）");
    // 显式降级：排期是派生数据，交卷结果已落库
    return;
  }
}
