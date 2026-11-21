/**
 * 改题后回刷历史判分（P0-1）。
 *
 * 背景（线上库 2026-11-14 快照体检）：题目答案被修订后，历史 `practice_logs`
 * 的 `is_correct` 保持旧值——q687/q691 的日志与改答案时刻精确咬合，同一答案
 * `["A","D"]` 在 05-22 07:24 前后分别被判错/对。后果：FSRS 排期与掌握度被脏数据
 * 驱动，且无法事后区分。
 *
 * 本模块在题目答案/选项变更时被 `adminService.updateQuestion` 调用：
 *   1. 用**当前**判分逻辑重算该题全部日志的 is_correct；
 *   2. 受影响用户的 FSRS 卡重置为 Relearning、立即到期（下次复习重排）；
 *   3. 受影响会话的 correct_count 重算（会话统计与日志一致）。
 *
 * 边界：只处理单题（一次改题影响面就是这道题的历史）；掌握度（user_mastery）
 * 是派生聚合，由既有掌握度链路在下次答题时更新，这里不整体重扫。
 */
import { drizzleDb } from "@/lib/db";
import {
  practice_logs,
  practice_sessions,
  question_srs,
  questions,
} from "@/lib/db/drizzle-schema";
import type { Executor } from "@/lib/db/executor";
import { checkAnswerCorrectness } from "@/lib/services/answer-check";
import { safeParseJson } from "@/lib/utils/json";
import { and, eq, sql } from "drizzle-orm";
import logger from "@/lib/logger";

export interface RegradeResult {
  questionId: number;
  logsScanned: number;
  logsFlipped: number;
  flippedToCorrect: number;
  flippedToIncorrect: number;
  usersReset: number;
  sessionsUpdated: number;
}

const EMPTY = (questionId: number): RegradeResult => ({
  questionId,
  logsScanned: 0,
  logsFlipped: 0,
  flippedToCorrect: 0,
  flippedToIncorrect: 0,
  usersReset: 0,
  sessionsUpdated: 0,
});

/** 解析 questions.options（JSON 字符串或数组） */
function parseOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (typeof raw === "string") return safeParseJson<string[]>(raw, []);
  return [];
}

/**
 * 重算某题全部练习日志的 is_correct，并修正派生数据。
 *
 * @param exec 事务执行器（管理员改题时与 update 同事务）；默认全局连接
 */
export async function regradeQuestionLogs(
  questionId: number,
  exec: Executor = drizzleDb,
): Promise<RegradeResult> {
  const [question] = await exec
    .select({
      answer: questions.answer,
      options: questions.options,
      type: questions.type,
    })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);

  if (!question) return EMPTY(questionId);

  const options = parseOptions(question.options);
  const answer = question.answer ?? "";
  const type = question.type ?? undefined;

  const logs = await exec
    .select({
      id: practice_logs.id,
      user_id: practice_logs.user_id,
      session_id: practice_logs.session_id,
      user_answer: practice_logs.user_answer,
      is_correct: practice_logs.is_correct,
    })
    .from(practice_logs)
    .where(eq(practice_logs.question_id, questionId));

  const users = new Set<number>();
  const flippedToIncorrectUsers = new Set<number>();
  const sessions = new Set<string>();
  let flipped = 0;
  let toCorrect = 0;
  let toIncorrect = 0;

  for (const log of logs) {
    const expected = checkAnswerCorrectness(
      log.user_answer ?? "",
      answer,
      options,
      type,
    );
    if (expected === Boolean(log.is_correct)) continue;

    await exec
      .update(practice_logs)
      .set({ is_correct: expected })
      .where(eq(practice_logs.id, log.id));

    flipped += 1;
    users.add(log.user_id);
    if (log.session_id) sessions.add(log.session_id);
    if (expected) {
      toCorrect += 1;
    } else {
      toIncorrect += 1;
      flippedToIncorrectUsers.add(log.user_id);
    }
  }

  // 受影响用户的 SRS 卡：重置为 Relearning 并立即到期，让 FSRS 用正确数据重排
  if (users.size > 0) {
    const dueNow = new Date().toISOString();
    for (const userId of users) {
      await exec
        .update(question_srs)
        .set({
          state: 3, // Relearning
          due_date: dueNow,
          scheduled_days: 0,
          elapsed_days: 0,
          ...(flippedToIncorrectUsers.has(userId)
            ? { lapses: sql`${question_srs.lapses} + 1` }
            : {}),
        })
        .where(
          and(
            eq(question_srs.user_id, userId),
            eq(question_srs.question_id, questionId),
          ),
        );
    }
  }

  // 受影响会话：correct_count 与日志重算后对齐
  for (const sessionId of sessions) {
    const correct = await exec
      .select({ n: sql<number>`count(*)` })
      .from(practice_logs)
      .where(
        and(
          eq(practice_logs.session_id, sessionId),
          eq(practice_logs.is_correct, true),
        ),
      );
    await exec
      .update(practice_sessions)
      .set({ correct_count: Number(correct[0]?.n ?? 0) })
      .where(eq(practice_sessions.id, sessionId));
  }

  const result: RegradeResult = {
    questionId,
    logsScanned: logs.length,
    logsFlipped: flipped,
    flippedToCorrect: toCorrect,
    flippedToIncorrect: toIncorrect,
    usersReset: users.size,
    sessionsUpdated: sessions.size,
  };

  if (flipped > 0) {
    logger.info(result, "[Regrade] 改题后回刷历史判分");
  }
  return result;
}
