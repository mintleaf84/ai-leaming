/**
 * 演示模式服务 (Drizzle 版)
 */

import { drizzleDb, drizzleSchema } from "@/lib/db";
import { eq, and, desc, sql } from "drizzle-orm";
import logger from "@/lib/logger";
import { Question } from "@/types";
import { QuestionRowSchema } from "@/lib/schemas";

/**
 * 将数据库原始行映射为业务 Question 类型
 */
function mapQuestion(q: Record<string, unknown>): Question {
  try {
    return QuestionRowSchema.parse(q);
  } catch (err) {
    logger.error(
      { err, questionId: q.id },
      "[DemoService] Question mapping failed",
    );
    return {
      ...q,
      options:
        typeof q.options === "string" ? JSON.parse(q.options) : q.options || [],
      tags: typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags || [],
      type: q.type || "single",
      dimension: q.dimension || "knowledge",
    } as Question;
  }
}

export const DemoService = {
  /** 检查全局演示模式是否开启 */
  async isDemoModeEnabled(): Promise<boolean> {
    try {
      const row = await drizzleDb.query.system_settings.findFirst({
        where: eq(drizzleSchema.system_settings.key, "demo_mode_enabled"),
      });
      return row?.value === "true";
    } catch {
      return false;
    }
  },

  /** 获取或创建演示会话 */
  async getDemoSession(userId: number): Promise<{
    questions: Question[];
    sessionId: string;
  } | null> {
    // 1. 查找已有的演示会话
    const existing = await drizzleDb.query.practice_sessions.findFirst({
      where: and(
        eq(drizzleSchema.practice_sessions.user_id, userId),
        eq(drizzleSchema.practice_sessions.is_demo, 1),
      ),
      orderBy: [desc(drizzleSchema.practice_sessions.created_at)],
    });

    if (existing && existing.questions_json) {
      // 重置演示进度，让用户每次进入都能从头体验
      await drizzleDb
        .delete(drizzleSchema.practice_logs)
        .where(eq(drizzleSchema.practice_logs.session_id, existing.id));

      await drizzleDb
        .update(drizzleSchema.practice_sessions)
        .set({ correct_count: 0 })
        .where(eq(drizzleSchema.practice_sessions.id, existing.id));

      logger.info({ sessionId: existing.id }, "[DemoMode] 重置并复用演示会话");

      try {
        const questions =
          typeof existing.questions_json === "string"
            ? JSON.parse(existing.questions_json)
            : existing.questions_json;
        return {
          questions: questions.map((q: Record<string, unknown>) =>
            mapQuestion(q),
          ),
          sessionId: existing.id,
        };
      } catch (e) {
        logger.error({ err: e }, "[DemoMode] 解析演示会话题目失败");
        return null;
      }
    }

    // 2. 创建新演示会话 (从题库随机选 10 题)
    const sessionId = `demo-${Math.random().toString(36).substring(2, 12)}`;

    const rawQuestions = await drizzleDb
      .select()
      .from(drizzleSchema.questions)
      .orderBy(sql`RANDOM()`)
      .limit(10);

    if (!rawQuestions || rawQuestions.length === 0) return null;

    const questions = rawQuestions.map((q) => mapQuestion(q));

    await drizzleDb.insert(drizzleSchema.practice_sessions).values({
      id: sessionId,
      user_id: userId,
      total_questions: questions.length,
      questions_json: JSON.stringify(questions),
      practice_mode: "smart",
      is_demo: 1,
    });

    logger.info({ sessionId }, "[DemoMode] 创建新演示会话");
    return { questions, sessionId };
  },
};
