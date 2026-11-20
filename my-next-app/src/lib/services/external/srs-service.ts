/**
 * `/api/external/srs` 的数据访问层。
 *
 * ## 为什么不复用 `srsService` 里现成的方法
 *
 * - `srsService.updateQuestionSrs` 用 `throw new Error("题目 ID ... 不存在")` 表达
 *   题目不存在，路由要把它与真实故障区分成 404 / 500 只能匹配文案；因此存在性预检
 *   仍单独一条查询（`questionExists`）。
 * - 「读旧状态 → 判幂等 → 推进调度」必须在**同一事务**里、并按 `(user, question)`
 *   串行，否则两笔并发各读同一份旧状态、各自 +1（评审指出过的两条竞态）。这段
 *   `withKeyedLock` + `withTransaction` 的组合原先写在路由里，现在原样搬到
 *   `recordExternalReview`，路由只负责 HTTP 语义。
 *
 * 幂等键：`answeredAt` 落到 `last_review` 上，同一时间重试直接返回当前状态。
 */

import { and, eq } from "drizzle-orm";
import { drizzleDb, drizzleSchema } from "@/lib/db";
import { withTransaction } from "@/lib/db/executor";
import { withKeyedLock } from "@/lib/services/keyed-lock";
import { srsService } from "@/lib/services/srs";

export type QuestionSrsRow = typeof drizzleSchema.question_srs.$inferSelect;

/** 推进后的调度状态（与 `srsService.updateQuestionSrs` 的返回同一对象） */
export type UpdatedSrsItem = Awaited<
  ReturnType<typeof srsService.updateQuestionSrs>
>;

/** 题目是否存在（先判再推进，才能稳定给出 404） */
export async function questionExists(questionId: number): Promise<boolean> {
  const [question] = await drizzleDb
    .select({ id: drizzleSchema.questions.id })
    .from(drizzleSchema.questions)
    .where(eq(drizzleSchema.questions.id, questionId))
    .limit(1);
  return Boolean(question);
}

export type ExternalReviewOutcome =
  | { duplicate: true; row: QuestionSrsRow }
  | { duplicate: false; item: UpdatedSrsItem };

/**
 * 记录一次外部复习：单事务内完成"幂等判定 + 调度推进 + 学习速度采样"。
 *
 * `duplicate: true` 表示 `answeredAt` 与既有 `last_review` 相同（同一时间重放），
 * 此时**不推进**调度，直接回当前状态行。
 */
export async function recordExternalReview(input: {
  userId: number;
  questionId: number;
  isCorrect: boolean;
  durationMs: number;
  answeredAt: Date;
  answeredAtIso: string;
  userAnswerLength?: number;
}): Promise<ExternalReviewOutcome> {
  const { userId, questionId, answeredAtIso } = input;

  return withKeyedLock(`srs:${userId}:${questionId}`, () =>
    withTransaction(async (exec) => {
      const [existing] = await exec
        .select()
        .from(drizzleSchema.question_srs)
        .where(
          and(
            eq(drizzleSchema.question_srs.user_id, userId),
            eq(drizzleSchema.question_srs.question_id, questionId),
          ),
        )
        .limit(1);

      if (existing?.last_review === answeredAtIso) {
        return { duplicate: true as const, row: existing };
      }

      const item = await srsService.updateQuestionSrs(
        userId,
        questionId,
        input.isCorrect,
        input.durationMs,
        input.answeredAt,
        undefined,
        input.userAnswerLength,
        exec,
      );
      return { duplicate: false as const, item };
    }),
  );
}
