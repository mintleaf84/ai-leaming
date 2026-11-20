import { drizzleDb, drizzleSchema } from "../db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { FenbiImportResult } from "../import/fenbi-parser";
import {
  contentHash,
  findQuestionIdByContent,
  normalizeQuestionContent,
} from "@/lib/services/question-dedup";
import { sanitizeHtml } from "../utils/security";
import { safeParseJson } from "../utils/json";
import { generateId } from "../utils/id";
import { log, logger } from "@/lib/logger";
import { checkAnswerCorrectness } from "@/lib/services/answer-check";
import { withTransaction } from "@/lib/db/executor";
import { ValidationError } from "@/lib/errors/app-error";
import { DryRunRollback, isDryRunRollback } from "./dry-run";

const { practice_sessions, questions, practice_logs, user_mastery } =
  drizzleSchema;

/**
 * 判断是否命中唯一索引冲突（并发下同一 sourceKey 的两次导入）。
 * drizzle 会把底层 SqliteError 包一层（外层 message 是 "Failed query: ..."，
 * code 在 cause 上），因此必须顺着 cause 链找，否则并发窗口会被当成真实错误抛出。
 */
function isUniqueViolation(e: unknown): boolean {
  let current: unknown = e;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const err = current as { code?: string; message?: string; cause?: unknown };
    const code = String(err.code || "");
    const message = String(err.message || "");
    if (
      code.includes("CONSTRAINT_UNIQUE") ||
      code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return true;
    }
    if (message.includes("UNIQUE constraint failed")) return true;
    current = err.cause;
  }
  return false;
}

/** 查询该用户已导入的同源会话 ID */
async function findExistingSession(
  userId: number,
  sourceKey: string,
): Promise<string | null> {
  const rows = await drizzleDb
    .select({ id: practice_sessions.id })
    .from(practice_sessions)
    .where(
      and(
        eq(practice_sessions.user_id, userId),
        eq(practice_sessions.source_key, sourceKey),
      ),
    )
    .limit(1);
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * 导入 Service
 * 处理业务逻辑与数据库交互
 */
/**
 * 导入串行锁。
 *
 * `@libsql/client` 的本地文件驱动只有一条连接：两个 `transaction()` 并发时
 * 会互相踩（第二个 BEGIN/COMMIT 报 "SQL statements in progress"）。既然物理上
 * 无法并行，就在服务层排队，保证「同一时刻只有一个导入事务」，并让并发请求
 * 落到幂等分支而不是数据库错误。
 */
let importQueue: Promise<unknown> = Promise.resolve();

/**
 * 全站唯一的写导入锁。
 *
 * 粉笔导入与回忆卡组导入用的是**同一条 SQLite 连接**，各自持有一把锁并不能互斥
 * ——「粉笔导入事务进行中 + 回忆导入开始」依然会撞 `SQL statements in progress`。
 * 因此两边共用这一个队列。
 */
export function withImportLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = importQueue.then(fn, fn);
  importQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 幂等命中时的统一返回 */
function duplicatedResult(sessionId: string) {
  return {
    sessionId,
    newQuestionsCount: 0,
    importedCount: 0,
    duplicated: true,
  };
}

/** agent 接口的幂等返回：字段名与 fenbi 导入不同，语义复用同一个判定 */
function duplicatedAgentResult(sessionId: string) {
  const base = duplicatedResult(sessionId);
  return {
    sessionId: base.sessionId,
    inserted: base.importedCount,
    duplicated: base.duplicated,
    // 幂等命中不重新判分（也没有新记录可判），差异数恒为 0
    regraded: 0,
  };
}

type MasteryDelta = { correct: number; total: number };

/**
 * 按 tag 把「本次答对/答题总数」增量写进 user_mastery。
 * 必须整体在调用方的事务里执行（exec 传 tx）：掌握度与日志要同生共死，
 * 否则一次回滚会留下虚高的掌握度分数。
 */
async function applyMasteryDeltas(
  exec: typeof drizzleDb,
  userId: number,
  changes: Map<string, MasteryDelta>,
): Promise<void> {
  for (const [tag, stats] of changes.entries()) {
    await exec
      .insert(user_mastery)
      .values({
        user_id: userId,
        tag_name: tag,
        correct_count: stats.correct,
        total_count: stats.total,
        score: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
      })
      .onConflictDoUpdate({
        target: [user_mastery.user_id, user_mastery.tag_name],
        set: {
          correct_count: sql`${user_mastery.correct_count} + ${stats.correct}`,
          total_count: sql`${user_mastery.total_count} + ${stats.total}`,
          score: sql`ROUND(CAST(${user_mastery.correct_count} + ${stats.correct} AS FLOAT) / CAST(${user_mastery.total_count} + ${stats.total} AS FLOAT) * 100, 2)`,
          last_updated: sql`CURRENT_TIMESTAMP`,
        },
      });
  }
}

/**
 * 会话 + 题目 + 日志 + 掌握度的原子写入。
 * 必须整体成功或整体回滚；返回本次新增/更新的题目数。
 */
async function writeImport(
  exec: typeof drizzleDb,
  userId: number,
  data: FenbiImportResult,
  sessionId: string,
): Promise<number> {
  // 1. 创建练习会话
  await exec.insert(practice_sessions).values({
    id: sessionId,
    user_id: userId,
    session_name: data.sessionName,
    source_key: data.sourceKey ?? null,
    total_questions: data.totalCount,
    correct_count: data.correctCount,
    practice_mode: "import",
    questions_json: JSON.stringify(
      data.questions.map((q) => ({
        externalId: q.externalId,
        content: q.content,
        type: q.type,
      })),
    ),
  });

  // 2. 批量处理题目 (Upsert)
  const batchSize = 50;
  const questionIdMap = new Map<string, number>();

  for (let i = 0; i < data.questions.length; i += batchSize) {
    const batch = data.questions.slice(i, i + batchSize);

    for (const q of batch) {
      const typeMap: Record<string, string> = {
        single: "single",
        multi: "multi",
        truefalse: "truefalse",
        fill_blank: "fill_blank",
      };
      const safeDimension = [
        "knowledge",
        "understanding",
        "application",
      ].includes(q.dimension)
        ? (q.dimension as "knowledge" | "understanding" | "application")
        : "knowledge";

      const sanitizedContent = sanitizeHtml(q.content);

      // 先按 external_id 判断：已存在则走下面的 upsert（刷新解析），
      // 不能被内容查重劫持到一条内容相同的旧副本上。
      const externalIdExists = q.externalId
        ? (
            await exec
              .select({ id: questions.id })
              .from(questions)
              .where(eq(questions.external_id, q.externalId))
              .limit(1)
          ).length > 0
        : false;

      // 内容级去重：仅在 external_id 不存在时，跨来源复用同题干+同选项的已有题
      if (!externalIdExists) {
        const existingByContent = await findQuestionIdByContent(
          sanitizedContent,
          exec,
          { options: q.options },
        );
        if (existingByContent) {
          // 题干+选项相同但答案不同：不能静默复用（否则导入的新答案被丢弃，
          // 判分继续按旧答案）。这种少见冲突按新题落库，交人工/清理裁决。
          const [existingRow] = await exec
            .select({ answer: questions.answer })
            .from(questions)
            .where(eq(questions.id, existingByContent))
            .limit(1);
          const sameAnswer =
            normalizeQuestionContent(existingRow?.answer ?? "") ===
            normalizeQuestionContent(q.answer ?? "");
          if (sameAnswer) {
            questionIdMap.set(q.externalId, existingByContent);
            continue;
          }
          log.error(
            `[Import] 同题干+选项但答案不同，按新题导入（不复用旧题）：existing=${existingByContent} external=${q.externalId}`,
          );
        }
      }

      const result = await exec
        .insert(questions)
        .values({
          external_id: q.externalId,
          content_hash: contentHash(sanitizedContent, q.options),
          content: sanitizedContent,
          options: JSON.stringify(q.options),
          answer: q.answer,
          explanation: sanitizeHtml(q.explanation),
          tags: JSON.stringify(q.tags),
          dimension: safeDimension,
          type: typeMap[q.type] || "single",
          source: q.source || "fenbi_import",
          correct_ratio: q.stats?.correctRatio ?? null,
          most_wrong_answer: q.stats?.mostWrongAnswer ?? null,
          material: q.material ? sanitizeHtml(q.material) : null,
          material_html: q.materialHtml ? sanitizeHtml(q.materialHtml) : null,
        })
        .onConflictDoUpdate({
          target: questions.external_id,
          set: {
            content: sql`excluded.content`,
            explanation: sql`excluded.explanation`,
            material: sql`excluded.material`,
            material_html: sql`excluded.material_html`,
            correct_ratio: sql`excluded.correct_ratio`,
            most_wrong_answer: sql`excluded.most_wrong_answer`,
            content_hash: sql`excluded.content_hash`,
            options: sql`excluded.options`,
          },
        })
        .returning({ id: questions.id });

      if (result.length > 0) {
        questionIdMap.set(q.externalId, result[0].id);
      }
    }
  }

  // 3. 批量记录日志
  if (data.records.length > 0) {
    const logValues = data.records
      .map((r) => {
        const qId = questionIdMap.get(r.externalId);
        if (!qId) return null;
        return {
          session_id: sessionId,
          user_id: userId,
          question_id: qId,
          user_answer: r.userAnswer,
          is_correct: r.isCorrect,
          duration_ms: r.durationMs,
          origin: "import",
          status: (r.userAnswer ?? "").trim() === "" ? "skipped" : "answered",
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (logValues.length > 0) {
      await exec.insert(practice_logs).values(logValues);
    }
  }

  // 4. 汇总并更新 Mastery
  const masteryChanges = new Map<string, MasteryDelta>();
  for (const record of data.records) {
    if ((record.userAnswer ?? "").trim() === "") continue; // 空答案=未作答，不计掌握度
    const question = data.questions.find(
      (q) => q.externalId === record.externalId,
    );
    if (question && question.tags.length > 0) {
      for (const tag of question.tags) {
        const current = masteryChanges.get(tag) || { correct: 0, total: 0 };
        current.total += 1;
        if (record.isCorrect) current.correct += 1;
        masteryChanges.set(tag, current);
      }
    }
  }

  await applyMasteryDeltas(exec, userId, masteryChanges);

  return questionIdMap.size;
}

// ==================== agent 答题记录导入（P3a） ====================

/** 单条答题记录（来自客户端，`isCorrect` 仅作参考：服务端一律重新判分） */
export interface AgentAnswerInput {
  questionId: number;
  userAnswer?: string | null;
  /** 客户端自报的对错。**不参与入库与统计**，只用于比对出 `regraded` 并打日志 */
  isCorrect: boolean;
  durationMs?: number | null;
}

/** POST /api/external/practice/answers 的入参（zod 校验后传入） */
export interface AgentAnswersImportInput {
  sessionKey: string;
  sessionName?: string | null;
  answers: AgentAnswerInput[];
}

export interface AgentAnswersImportResult {
  sessionId: string;
  inserted: number;
  duplicated: boolean;
  /**
   * 客户端自报 `isCorrect` 与服务端重新判分不一致的条数（`requested != graded`）。
   * 幂等命中时为 0：这次没有重新判分任何记录。
   */
  regraded: number;
  /** 仅 dry-run 时出现：true 表示这次没有真正写库（计数是"如果真执行会写入多少"） */
  dryRun?: true;
}

/**
 * 题目不可见（不存在 / 已被删除）时抛出，由路由层映射成 400。
 * 带上全部非法 ID，路由只回前 5 个，避免错误响应体被刷爆。
 *
 * 继承 `ValidationError` 只是**兜底**：路由里的 `instanceof` 分支优先命中，
 * 响应逐字节不变；万一某条路由漏写了分支，`toErrorResponse` 会给 400 + 可读文案，
 * 而不是把调用方输入错误报成 500。
 */
export class InvalidQuestionIdsError extends ValidationError {
  readonly invalidQuestionIds: number[];

  constructor(invalidQuestionIds: number[]) {
    super(`以下题目不存在或不可见: ${invalidQuestionIds.join(", ")}`, {
      code: "questions.ids.invalid",
    });
    this.name = "InvalidQuestionIdsError";
    this.invalidQuestionIds = invalidQuestionIds;
  }
}

/** agent 来源的 source_key 统一前缀，避免与粉笔的 sourceKey 撞车 */
const AGENT_SOURCE_KEY_PREFIX = "agent:";

/**
 * agent 答题记录的原子写入：会话 + 日志 + 掌握度。
 *
 * 题目预检也放在事务内（而不是事务外先查一遍）：这样"校验通过"与"写入"
 * 之间不存在题目被删除的时间窗；预检失败时事务整体回滚，不会留下半截会话。
 *
 * **对错一律由服务端重新判分**（§31）：离线复用同一份题库，客户端没有理由
 * 权威判定；历史实现直接落 `a.isCorrect`，客户端传 true 就能刷高正确率与掌握度。
 * 判分复用 `checkAnswerCorrectness`，与在线提交（`submitAnswerWithValidation`）
 * 完全同一套口径（单选标号/文本互认、多选集合比较、填空逐空）。
 */
async function writeAgentAnswers(
  exec: typeof drizzleDb,
  userId: number,
  data: AgentAnswersImportInput,
  sessionId: string,
  sourceKey: string,
): Promise<{ inserted: number; regraded: number }> {
  // 1. 题目预检：去重后一次查完，缺任何一道都整批拒绝（不静默跳过）
  const uniqueIds = Array.from(new Set(data.answers.map((a) => a.questionId)));
  const rows = await exec
    .select({
      id: questions.id,
      tags: questions.tags,
      answer: questions.answer,
      options: questions.options,
      type: questions.type,
    })
    .from(questions)
    .where(inArray(questions.id, uniqueIds));

  const found = new Map(rows.map((r) => [r.id, r]));
  const missing = uniqueIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new InvalidQuestionIdsError(missing);
  }

  // 1.5 服务端重新判分；客户端自报值只用于比对差异与记日志，不参与统计
  const graded = data.answers.map((answer) => {
    const question = found.get(answer.questionId);
    const parsedOptions = safeParseJson<unknown>(question?.options, []);
    const options = Array.isArray(parsedOptions)
      ? parsedOptions.map((option) => String(option))
      : [];
    return checkAnswerCorrectness(
      answer.userAnswer ?? "",
      question?.answer ?? "",
      options,
      question?.type ?? undefined,
    );
  });

  let regraded = 0;
  data.answers.forEach((answer, index) => {
    if (answer.isCorrect === graded[index]) return;
    regraded += 1;
    logger.debug(
      {
        sessionKey: data.sessionKey,
        questionId: answer.questionId,
        requested: answer.isCorrect,
        graded: graded[index],
      },
      "[Import] 离线作答对错与服务端重判不一致，以服务端结果入库",
    );
  });

  // 2. 创建练习会话（与粉笔导入共用 practice_mode = "import"）
  const durationMs = data.answers.reduce(
    (sum, a) => sum + (a.durationMs ?? 0),
    0,
  );
  await exec.insert(practice_sessions).values({
    id: sessionId,
    user_id: userId,
    session_name: data.sessionName ?? "由 agent 导入",
    source_key: sourceKey,
    total_questions: data.answers.length,
    correct_count: data.answers.filter(
      (a, i) => graded[i] && (a.userAnswer ?? "").trim() !== "",
    ).length,
    practice_mode: "import",
    // 存纯 id 数组：getSessionById 只对「数字/字符串数组」走 id 分支，
    // 存对象数组会落到"完整对象"分支，详情页解析直接坏掉
    questions_json: JSON.stringify(data.answers.map((a) => a.questionId)),
    total_duration_ms: durationMs,
  });

  // 3. 逐题写日志（单条 INSERT ... VALUES (...), (...) 多行插入）
  await exec.insert(practice_logs).values(
    data.answers.map((a, i) => ({
      session_id: sessionId,
      user_id: userId,
      question_id: a.questionId,
      user_answer: a.userAnswer ?? null,
      is_correct: graded[i],
      duration_ms: a.durationMs ?? null,
      // 一律标 agent 来源（SRS 同步会跳过）：离线作答仍不进 FSRS 排期
      origin: "agent",
      status: (a.userAnswer ?? "").trim() === "" ? "skipped" : "answered",
    })),
  );

  // 4. 按题目 tags 增量累加掌握度（与粉笔导入同一段逻辑）
  const masteryChanges = new Map<string, MasteryDelta>();
  data.answers.forEach((answer, i) => {
    if ((answer.userAnswer ?? "").trim() === "") return; // 空答案=未作答，不计掌握度
    const parsedTags = safeParseJson<unknown>(
      found.get(answer.questionId)?.tags,
      [],
    );
    // safeParseJson 只保证"能解析"，不保证是数组（历史脏数据可能是 "null"/"{}"）
    const tags = Array.isArray(parsedTags) ? parsedTags : [];
    for (const tag of tags) {
      if (typeof tag !== "string" || tag.length === 0) continue;
      const current = masteryChanges.get(tag) || { correct: 0, total: 0 };
      current.total += 1;
      if (graded[i]) current.correct += 1;
      masteryChanges.set(tag, current);
    }
  });
  await applyMasteryDeltas(exec, userId, masteryChanges);

  return { inserted: data.answers.length, regraded };
}

export const importService = {
  /**
   * 导入粉笔数据到数据库
   * @param userId 用户 ID
   * @param data 解析后的粉笔数据
   * @returns 导入结果统计
   */
  importFenbiData: async (userId: number, data: FenbiImportResult) => {
    const sessionId = `fenbi_${generateId("", 15)}`;

    // 0. 幂等预检：同一用户同一来源只导入一次，重复推送直接复用既有会话，
    //    不再写日志、不再累加掌握度（否则重复导入会虚高 mastery 分数）。
    if (data.sourceKey) {
      const existingId = await findExistingSession(userId, data.sourceKey);
      if (existingId) return duplicatedResult(existingId);
    }

    // 1-4 放在同一事务里提交：任何一步失败都不能留下"半截导入"的会话行，
    // 否则并发请求/重试会把这条会话当成"已完成"而永久跳过，日志与掌握度
    // 数据将永久缺失（评审指出的高危缺口）。
    let newQuestionsCount: number;
    try {
      newQuestionsCount = await withImportLock(() =>
        withTransaction(async (exec) => {
          // 事务内所有写操作都必须走 tx：用全局 drizzleDb 会让语句跑在事务连接
          // 之外，表现为逐条 Failed query + 提交时 SQLITE_BUSY。
          return await writeImport(exec, userId, data, sessionId);
        }),
      );
    } catch (e) {
      // 并发窗口：预检通过但另一请求先提交，唯一索引兜底后按重复处理
      if (data.sourceKey && isUniqueViolation(e)) {
        const existingId = await findExistingSession(userId, data.sourceKey);
        if (existingId) return duplicatedResult(existingId);
      }
      throw e;
    }

    // 5. 自动同步到 SRS 系统（独立事务，失败不影响导入结果）
    const result = {
      sessionId,
      newQuestionsCount,
      importedCount: data.records.length,
      duplicated: false,
    };

    try {
      const { srsService } = await import("./srs");
      await srsService.syncFromPracticeLogs(userId);
    } catch (e) {
      log.error("[Import] SRS 同步失败:", e);
      // 显式降级：SRS 同步独立于导入事务，失败仍按导入成功返回
      return result;
    }

    return result;
  },

  /**
   * 导入 agent/离线端的答题记录。
   *
   * **入参里的 `isCorrect` 不可信**（§31）：服务端按题库重新判分后入库，
   * 客户端自报值只用于统计差异数 `regraded` 与打 debug 日志。
   *
   * 幂等键是 `sessionKey`（由 agent 生成、跨重试稳定），落库时加 `agent:` 前缀
   * 写进 `practice_sessions.source_key`，与粉笔导入共用同一套「先查后写 + 唯一索引兜并发」。
   * 幂等命中时 `regraded` 恒为 0（没有重新判分任何记录，也不重复计数）。
   *
   * `options.dryRun` 为 true 时走完真实写入路径后强制回滚：题目不存在仍抛
   * `InvalidQuestionIdsError`（预演必须能暴露 400），返回值多一个 `dryRun: true`。
   *
   * @throws InvalidQuestionIdsError 请求里有不存在于题库的 questionId（整批拒绝）
   */
  importAgentAnswers: async (
    userId: number,
    data: AgentAnswersImportInput,
    options: { dryRun?: boolean } = {},
  ): Promise<AgentAnswersImportResult> => {
    const sessionId = `agent_${generateId("", 15)}`;
    const sourceKey = `${AGENT_SOURCE_KEY_PREFIX}${data.sessionKey}`;

    // 0. 幂等预检：同一用户同一 sessionKey 只算一次，重复提交不再写日志、
    //    不再累加掌握度（否则 agent 重试会把 mastery 分数刷虚高）。
    const existingId = await findExistingSession(userId, sourceKey);
    if (existingId) {
      const duplicated = duplicatedAgentResult(existingId);
      // 与真实的预演分支保持同一语义：命中幂等时也要带 dryRun，调用方才能
      // 用同一个判断（duplicate 先看，再看 dryRun）区分四种结果
      return options.dryRun ? { ...duplicated, dryRun: true } : duplicated;
    }

    let outcome: { inserted: number; regraded: number };
    try {
      outcome = await withImportLock(() =>
        withTransaction(async (exec) => {
          // 事务内所有写操作都必须走 tx（理由见 importFenbiData 同位置注释）
          const result = await writeAgentAnswers(
            exec,
            userId,
            data,
            sessionId,
            sourceKey,
          );
          // 预演：写入已经发生过（含题目预检与掌握度累加），这里抛哨兵让事务整体回滚，
          // 只把计数带出去 —— 这样"会写多少条"与"真写多少条"永远同一段代码算出来
          if (options.dryRun) throw new DryRunRollback(result);
          return result;
        }),
      );
    } catch (e) {
      if (isDryRunRollback<{ inserted: number; regraded: number }>(e)) {
        return {
          sessionId,
          inserted: e.value.inserted,
          duplicated: false,
          regraded: e.value.regraded,
          dryRun: true,
        };
      }
      // 并发窗口：预检通过但另一请求先提交，唯一索引兜底后按重复处理
      if (isUniqueViolation(e)) {
        const concurrentId = await findExistingSession(userId, sourceKey);
        if (concurrentId) return duplicatedAgentResult(concurrentId);
      }
      // 校验失败（题目不存在等）原样抛给路由层映射 400
      throw e;
    }

    return {
      sessionId,
      inserted: outcome.inserted,
      duplicated: false,
      regraded: outcome.regraded,
    };
  },
};

/**
 * 仅供测试：暴露内部判定函数（运行时无副作用）。
 * 用于确定性验证「唯一约束冲突能穿透 drizzle 的包装错误」。
 */
export const __test__ = { isUniqueViolation };
