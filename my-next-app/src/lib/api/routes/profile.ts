import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { drizzleDb, drizzleSchema } from '@/lib/db'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'
import { eq, count, sum, sql, and, notInArray } from 'drizzle-orm'

const app = new OpenAPIHono()

const ProfileResponseSchema = z.object({
    id: z.number(),
    username: z.string(),
    role: z.string(),
    createdAt: z.string(),
    stats: z.object({
        totalSessions: z.number().describe('总练习会话数'),
        totalAnswered: z.number().describe('总答题数'),
        totalCorrect: z.number().describe('总答对数'),
        overallAccuracy: z.number().describe('综合正确率 (0-1)'),
        knowledgeCardCount: z.number().describe('知识卡片数量'),
        wrongBookCount: z.number().describe('未掌握错题数量'),
    })
})

const getProfileRoute = createRoute({
    method: 'get',
    path: '/',
    middleware: [authMiddleware] as const,
    responses: {
        200: {
            description: '用户个人信息',
            content: {
                'application/json': {
                    schema: ProfileResponseSchema
                }
            }
        },
        404: { description: '用户不存在' }
    }
})

app.openapi(getProfileRoute, async (c) => {
    const user = getCurrentUser(c)
    const userId = Number(user.id)

    // 查询用户基础信息
    const userRow = await drizzleDb.query.users.findFirst({
        where: eq(drizzleSchema.users.id, userId),
        columns: { id: true, username: true, role: true, created_at: true }
    });

    if (!userRow) {
        return c.json({ error: '用户不存在' }, 404)
    }

    // 总会话数
    const sessionCount = await drizzleDb
        .select({ count: count() })
        .from(drizzleSchema.practice_sessions)
        .where(eq(drizzleSchema.practice_sessions.user_id, userId));

    // 答题总数 & 正确数
    const answerStats = await drizzleDb
        .select({
            total: count(),
            correct: sum(sql`CASE WHEN ${drizzleSchema.practice_logs.is_correct} = 1 THEN 1 ELSE 0 END`)
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

    // 未掌握错题数
    const masteredSubquery = drizzleDb
        .select({ question_id: drizzleSchema.mastered_questions.question_id })
        .from(drizzleSchema.mastered_questions)
        .where(eq(drizzleSchema.mastered_questions.user_id, userId));

    const wrongBookCount = await drizzleDb
        .select({ count: sql`COUNT(DISTINCT ${drizzleSchema.practice_logs.question_id})` })
        .from(drizzleSchema.practice_logs)
        .where(
            and(
                eq(drizzleSchema.practice_logs.user_id, userId),
                eq(drizzleSchema.practice_logs.is_correct, false),
                notInArray(drizzleSchema.practice_logs.question_id, masteredSubquery)
            )
        );

    return c.json({
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
        createdAt: userRow.created_at || '',
        stats: {
            totalSessions: sessionCount[0]?.count ?? 0,
            totalAnswered,
            totalCorrect,
            overallAccuracy: parseFloat(overallAccuracy.toFixed(4)),
            knowledgeCardCount: cardCount[0]?.count ?? 0,
            wrongBookCount: Number(wrongBookCount[0]?.count ?? 0),
        }
    })
})

export default app
