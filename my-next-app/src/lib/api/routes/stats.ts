import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { statsService } from "@/lib/services/stats";

const app = new OpenAPIHono();

const StatsResponseSchema = z.object({
  todayCount: z.number().describe("今日练习题数"),
  todayCorrect: z.number().describe("今日答对题数"),
  todayAccuracy: z.number().describe("今日正确率 (0-1)"),
  totalCount: z.number().describe("历史总练习次数（题数）"),
  totalCorrect: z.number().describe("历史总答对次数"),
  overallAccuracy: z.number().describe("历史总正确率 (0-1)"),
  streakDays: z.number().describe("连续学习天数"),
  totalSessions: z.number().describe("历史总会话数"),
});

const getStatsRoute = createRoute({
  method: "get",
  path: "/",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      description: "用户学习统计数据",
      content: {
        "application/json": {
          schema: StatsResponseSchema,
        },
      },
    },
  },
});

app.openapi(getStatsRoute, async (c) => {
  const user = getCurrentUser(c);
  const userId = Number(user.id);

  const stats = await statsService.getUserStats(userId);

  const todayAccuracy =
    stats.todayPracticed > 0 ? stats.todayCorrect / stats.todayPracticed : 0;
  const overallAccuracy =
    stats.totalPracticed > 0 ? stats.totalCorrect / stats.totalPracticed : 0;

  return c.json({
    todayCount: stats.todayPracticed,
    todayCorrect: stats.todayCorrect,
    todayAccuracy: parseFloat(todayAccuracy.toFixed(4)),
    totalCount: stats.totalPracticed,
    totalCorrect: stats.totalCorrect,
    overallAccuracy: parseFloat(overallAccuracy.toFixed(4)),
    streakDays: stats.streakDays,
    totalSessions: stats.totalSessions,
  });
});

export default app;
