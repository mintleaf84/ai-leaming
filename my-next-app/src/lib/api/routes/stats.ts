import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { db } from '@/lib/db'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'
import { getBeijingDateString } from '@/lib/utils/datetime'

const app = new OpenAPIHono()

const StatsResponseSchema = z.object({
    todayCount: z.number().describe('今日练习题数'),
    todayCorrect: z.number().describe('今日答对题数'),
    todayAccuracy: z.number().describe('今日正确率 (0-1)'),
    totalCount: z.number().describe('历史总练习次数（题数）'),
    totalCorrect: z.number().describe('历史总答对次数'),
    overallAccuracy: z.number().describe('历史总正确率 (0-1)'),
    streakDays: z.number().describe('连续学习天数'),
    totalSessions: z.number().describe('历史总会话数'),
})

const getStatsRoute = createRoute({
    method: 'get',
    path: '/',
    middleware: [authMiddleware] as const,
    responses: {
        200: {
            description: '用户学习统计数据',
            content: {
                'application/json': {
                    schema: StatsResponseSchema
                }
            }
        }
    }
})

app.openapi(getStatsRoute, async (c) => {
    const user = getCurrentUser(c)
    const userId = Number(user.id)
    const today = getBeijingDateString()

    // 今日统计
    const todayRow = db.prepare(`
        SELECT 
            COUNT(*) as count,
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
        FROM practice_logs
        WHERE user_id = ? AND date(timestamp) = date(?)
    `).get(userId, today) as { count: number; correct: number | null }

    const todayCount = todayRow.count
    const todayCorrect = todayRow.correct ?? 0
    const todayAccuracy = todayCount > 0 ? todayCorrect / todayCount : 0

    // 历史总统计
    const totalRow = db.prepare(`
        SELECT 
            COUNT(*) as count,
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
        FROM practice_logs
        WHERE user_id = ?
    `).get(userId) as { count: number; correct: number | null }

    const totalCount = totalRow.count
    const totalCorrect = totalRow.correct ?? 0
    const overallAccuracy = totalCount > 0 ? totalCorrect / totalCount : 0

    // 总会话数
    const sessionRow = db.prepare(`
        SELECT COUNT(*) as count FROM practice_sessions WHERE user_id = ?
    `).get(userId) as { count: number }

    // 连续学习天数（从今天往前推，找连续有记录的天数）
    const activeDays = db.prepare(`
        SELECT DISTINCT date(timestamp) as day
        FROM practice_logs
        WHERE user_id = ?
        ORDER BY day DESC
        LIMIT 365
    `).all(userId) as { day: string }[]

    let streakDays = 0
    if (activeDays.length > 0) {
        // 检查今天或昨天是否有记录（支持当天还没做题但昨天有的情况）
        const yesterday = getBeijingDateString(new Date(Date.now() - 86400000))
        const firstDay = activeDays[0].day
        if (firstDay !== today && firstDay !== yesterday) {
            streakDays = 0
        } else {
            streakDays = 1
            for (let i = 1; i < activeDays.length; i++) {
                const prev = new Date(activeDays[i - 1].day)
                const curr = new Date(activeDays[i].day)
                const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000)
                if (diffDays === 1) {
                    streakDays++
                } else {
                    break
                }
            }
        }
    }

    return c.json({
        todayCount,
        todayCorrect,
        todayAccuracy: parseFloat(todayAccuracy.toFixed(4)),
        totalCount,
        totalCorrect,
        overallAccuracy: parseFloat(overallAccuracy.toFixed(4)),
        streakDays,
        totalSessions: sessionRow.count,
    })
})

export default app
