import { drizzleDb, drizzleSchema } from "@/lib/db";
import { eq, and, sql, count, sum, ne, notInArray } from "drizzle-orm";

export interface UserProfileData {
  username: string;
  role: string;
  created_at: string;
  stats: {
    total_questions: number;
    correct_count: number;
    accuracy: number;
    practice_days: number;
    total_sessions: number;
    total_tags: number;
    mastered_tags: number;
    total_chats: number;
  };
}

/**
 * 画像页概览（`GET /api/profile`）：字段名与口径跟 `UserProfileData` 不同，
 * 见 `getProfileOverview` 的注释。
 */
export interface UserProfileOverview {
  id: number;
  username: string;
  /** 与 `users.role` 列同型（可空）：路由原样透传，不做默认值改写 */
  role: string | null;
  created_at: string;
  stats: {
    total_sessions: number;
    total_answered: number;
    total_correct: number;
    overall_accuracy: number;
    knowledge_card_count: number;
    wrong_book_count: number;
  };
}

/**
 * 用户服务 - 处理用户画像、账号设置等逻辑
 */
export const userService = {
  /**
   * 获取用户完整画像统计
   */
  async getUserProfileFull(userId: number): Promise<UserProfileData | null> {
    // 并发查询各项统计指标
    const [practiceStats, sessionStats, masteryStats, chatStats, userInfo] =
      await Promise.all([
        // 练习统计
        drizzleDb
          .select({
            total_questions: count(),
            correct_count: sql<number>`SUM(CASE WHEN ${drizzleSchema.practice_logs.is_correct} = 1 THEN 1 ELSE 0 END)`,
            practice_days: sql<number>`COUNT(DISTINCT date(${drizzleSchema.practice_logs.timestamp}))`,
          })
          .from(drizzleSchema.practice_logs)
          .where(eq(drizzleSchema.practice_logs.user_id, userId))
          .get(),

        // 会话统计
        drizzleDb
          .select({ total_sessions: count() })
          .from(drizzleSchema.practice_sessions)
          .where(eq(drizzleSchema.practice_sessions.user_id, userId))
          .get(),

        // 掌握度统计
        drizzleDb
          .select({
            total_tags: count(),
            mastered_tags: sql<number>`SUM(CASE WHEN ${drizzleSchema.user_mastery.score} >= 80 THEN 1 ELSE 0 END)`,
          })
          .from(drizzleSchema.user_mastery)
          .where(eq(drizzleSchema.user_mastery.user_id, userId))
          .get(),

        // 聊天统计
        drizzleDb
          .select({ total_chats: count() })
          .from(drizzleSchema.chat_sessions)
          .where(eq(drizzleSchema.chat_sessions.user_id, userId))
          .get(),

        // 基础信息
        drizzleDb
          .select({
            username: drizzleSchema.users.username,
            role: drizzleSchema.users.role,
            created_at: drizzleSchema.users.created_at,
          })
          .from(drizzleSchema.users)
          .where(eq(drizzleSchema.users.id, userId))
          .get(),
      ]);

    if (!userInfo) return null;

    const totalQuestions = practiceStats?.total_questions || 0;
    const correctCount = practiceStats?.correct_count || 0;

    return {
      username: userInfo.username,
      role: userInfo.role || "student",
      created_at: userInfo.created_at || "",
      stats: {
        total_questions: totalQuestions,
        correct_count: correctCount,
        accuracy: totalQuestions
          ? Math.round((correctCount / totalQuestions) * 100)
          : 0,
        practice_days: practiceStats?.practice_days || 0,
        total_sessions: sessionStats?.total_sessions || 0,
        total_tags: masteryStats?.total_tags || 0,
        mastered_tags: masteryStats?.mastered_tags || 0,
        total_chats: chatStats?.total_chats || 0,
      },
    };
  },

  /**
   * `GET /api/profile` 的画像概览。
   *
   * 为什么不复用上面的 `getUserProfileFull`：两者**统计口径不同**，不是同一个查询
   * 的两种叫法。画像页要的是「未掌握错题数」（`practice_logs` 里答错过的
   * distinct 题号，再排除 `mastered_questions`）与「知识卡片数」（`knowledge_cards`），
   * 而 `getUserProfileFull` 给的是掌握度标签数、练习天数、聊天会话数，且正确率是
   * 0–100 的整数百分比。硬套会让接口字段名与语义双双对不上，因此保留独立方法，
   * 逐条沿用原路由里的聚合（口径、`COUNT(DISTINCT …)`、`toFixed(4)` 都不变）。
   */
  async getProfileOverview(userId: number): Promise<UserProfileOverview | null> {
    const userRow = await drizzleDb.query.users.findFirst({
      where: eq(drizzleSchema.users.id, userId),
      columns: { id: true, username: true, role: true, created_at: true },
    });

    if (!userRow) return null;

    // 总会话数
    const sessionCount = await drizzleDb
      .select({ count: count() })
      .from(drizzleSchema.practice_sessions)
      .where(eq(drizzleSchema.practice_sessions.user_id, userId));

    // 答题总数 & 正确数
    const answerStats = await drizzleDb
      .select({
        total: count(),
        correct: sum(
          sql`CASE WHEN ${drizzleSchema.practice_logs.is_correct} = 1 THEN 1 ELSE 0 END`,
        ),
      })
      .from(drizzleSchema.practice_logs)
      .where(eq(drizzleSchema.practice_logs.user_id, userId));

    const totalAnswered = answerStats[0]?.total ?? 0;
    const totalCorrect = Number(answerStats[0]?.correct ?? 0);
    const overallAccuracy = totalAnswered > 0 ? totalCorrect / totalAnswered : 0;

    // 知识卡片数量
    const cardCount = await drizzleDb
      .select({ count: count() })
      .from(drizzleSchema.knowledge_cards)
      .where(eq(drizzleSchema.knowledge_cards.user_id, userId));

    // 未掌握错题数：答错过的题里，排除已掌握（mastered_questions）的
    const masteredSubquery = drizzleDb
      .select({ question_id: drizzleSchema.mastered_questions.question_id })
      .from(drizzleSchema.mastered_questions)
      .where(eq(drizzleSchema.mastered_questions.user_id, userId));

    const wrongBookCount = await drizzleDb
      .select({
        count: sql`COUNT(DISTINCT ${drizzleSchema.practice_logs.question_id})`,
      })
      .from(drizzleSchema.practice_logs)
      .where(
        and(
          eq(drizzleSchema.practice_logs.user_id, userId),
          eq(drizzleSchema.practice_logs.is_correct, false),
          notInArray(drizzleSchema.practice_logs.question_id, masteredSubquery),
        ),
      );

    return {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      created_at: userRow.created_at || "",
      stats: {
        total_sessions: sessionCount[0]?.count ?? 0,
        total_answered: totalAnswered,
        total_correct: totalCorrect,
        overall_accuracy: parseFloat(overallAccuracy.toFixed(4)),
        knowledge_card_count: cardCount[0]?.count ?? 0,
        wrong_book_count: Number(wrongBookCount[0]?.count ?? 0),
      },
    };
  },

  /**
   * 更新用户名
   */
  async updateUsername(
    userId: number,
    newUsername: string,
  ): Promise<{ success: boolean; error?: string }> {
    // 1. 查重
    const existing = await drizzleDb
      .select({ id: drizzleSchema.users.id })
      .from(drizzleSchema.users)
      .where(
        and(
          eq(drizzleSchema.users.username, newUsername),
          ne(drizzleSchema.users.id, userId),
        ),
      )
      .get();

    if (existing) return { success: false, error: "该用户名已被使用" };

    // 2. 更新
    await drizzleDb
      .update(drizzleSchema.users)
      .set({ username: newUsername })
      .where(eq(drizzleSchema.users.id, userId));

    return { success: true };
  },
};
