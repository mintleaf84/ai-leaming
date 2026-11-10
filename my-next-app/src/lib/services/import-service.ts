import { drizzleDb, drizzleSchema } from "../db";
import { and, eq, sql } from "drizzle-orm";
import { FenbiImportResult } from "../import/fenbi-parser";
import { sanitizeHtml } from "../utils/security";
import { generateId } from "../utils/id";

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

function withImportLock<T>(fn: () => Promise<T>): Promise<T> {
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

      const result = await exec
        .insert(questions)
        .values({
          external_id: q.externalId,
          content: sanitizeHtml(q.content),
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
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (logValues.length > 0) {
      await exec.insert(practice_logs).values(logValues);
    }
  }

  // 4. 汇总并更新 Mastery
  const masteryChanges = new Map<string, { correct: number; total: number }>();
  for (const record of data.records) {
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

  for (const [tag, stats] of masteryChanges.entries()) {
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

  return questionIdMap.size;
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
        drizzleDb.transaction(async (tx) => {
          // 事务内所有写操作都必须走 tx：用全局 drizzleDb 会让语句跑在事务连接
          // 之外，表现为逐条 Failed query + 提交时 SQLITE_BUSY。
          const exec = tx as unknown as typeof drizzleDb;
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
    try {
      const { srsService } = await import("./srs");
      await srsService.syncFromPracticeLogs(userId);
    } catch (e) {
      console.error("[Import] SRS 同步失败:", e);
    }

    return {
      sessionId,
      newQuestionsCount,
      importedCount: data.records.length,
      duplicated: false,
    };
  },
};

/**
 * 仅供测试：暴露内部判定函数（运行时无副作用）。
 * 用于确定性验证「唯一约束冲突能穿透 drizzle 的包装错误」。
 */
export const __test__ = { isUniqueViolation };
