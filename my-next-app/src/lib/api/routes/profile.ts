import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { db } from '@/lib/db'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'

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
    const userRow = db.prepare(`
        SELECT id, username, role, created_at FROM users WHERE id = ?
    `).get(userId) as { id: number; username: string; role: string; created_at: string } | undefined

    if (!userRow) {
        return c.json({ error: '用户不存在' }, 404)
    }

    // 总会话数
    const sessionRow = db.prepare(`
        SELECT COUNT(*) as count FROM practice_sessions WHERE user_id = ?
    `).get(userId) as { count: number }

    // 答题总数 & 正确数
    const answerRow = db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
        FROM practice_logs
        WHERE user_id = ?
    `).get(userId) as { total: number; correct: number | null }

    const totalAnswered = answerRow.total
    const totalCorrect = answerRow.correct ?? 0
    const overallAccuracy = totalAnswered > 0 ? totalCorrect / totalAnswered : 0

    // 知识卡片数量
    const cardRow = db.prepare(`
        SELECT COUNT(*) as count FROM knowledge_cards WHERE user_id = ?
    `).get(userId) as { count: number }

    // 未掌握错题数
    const wrongRow = db.prepare(`
        SELECT COUNT(DISTINCT question_id) as count
        FROM practice_logs
        WHERE user_id = ? AND is_correct = 0
            AND question_id NOT IN (SELECT question_id FROM mastered_questions WHERE user_id = ?)
    `).get(userId, userId) as { count: number }

    return c.json({
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
        createdAt: userRow.created_at,
        stats: {
            totalSessions: sessionRow.count,
            totalAnswered,
            totalCorrect,
            overallAccuracy: parseFloat(overallAccuracy.toFixed(4)),
            knowledgeCardCount: cardRow.count,
            wrongBookCount: wrongRow.count,
        }
    })
})

export default app
