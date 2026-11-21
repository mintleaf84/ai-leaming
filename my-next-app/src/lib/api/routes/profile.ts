import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { authMiddleware, getCurrentUser } from "@/lib/api/middlewares/auth";
import { userService } from "@/lib/services/user";

const app = new OpenAPIHono();

const ProfileResponseSchema = z.object({
  id: z.number(),
  username: z.string(),
  role: z.string(),
  createdAt: z.string(),
  stats: z.object({
    totalSessions: z.number().describe("总练习会话数"),
    totalAnswered: z.number().describe("总答题数"),
    totalCorrect: z.number().describe("总答对数"),
    overallAccuracy: z.number().describe("综合正确率 (0-1)"),
    knowledgeCardCount: z.number().describe("知识卡片数量"),
    wrongBookCount: z.number().describe("未掌握错题数量"),
  }),
});

const getProfileRoute = createRoute({
  method: "get",
  path: "/",
  middleware: [authMiddleware] as const,
  responses: {
    200: {
      description: "用户个人信息",
      content: {
        "application/json": {
          schema: ProfileResponseSchema,
        },
      },
    },
    404: { description: "用户不存在" },
  },
});

app.openapi(getProfileRoute, async (c) => {
  const user = getCurrentUser(c);
  const profile = await userService.getProfileOverview(Number(user.id));

  if (!profile) {
    return c.json({ error: "用户不存在" }, 404);
  }

  return c.json({
    id: profile.id,
    username: profile.username,
    role: profile.role,
    createdAt: profile.created_at,
    stats: {
      totalSessions: profile.stats.total_sessions,
      totalAnswered: profile.stats.total_answered,
      totalCorrect: profile.stats.total_correct,
      overallAccuracy: profile.stats.overall_accuracy,
      knowledgeCardCount: profile.stats.knowledge_card_count,
      wrongBookCount: profile.stats.wrong_book_count,
    },
  });
});

export default app;
