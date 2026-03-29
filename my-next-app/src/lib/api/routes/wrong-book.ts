import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import db from '@/lib/db'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'

const app = new OpenAPIHono()

// ==================== Schema 定义 ====================

const WrongQuestionSchema = z.object({
    questionId: z.string(),
    questionContent: z.string(),
    tags: z.array(z.string()),
    wrongCount: z.number(),
    lastWrongAt: z.string(),
    correctAnswer: z.string(),
    userLastAnswer: z.string(),
})

const WrongQuestionsByTagSchema = z.object({
    tag: z.string(),
    count: z.number(),
    questions: z.array(WrongQuestionSchema),
})

const StatsSchema = z.object({
    total: z.number(),
    recent: z.number(),
    frequent: z.number(),
})

const WrongQuestionDetailSchema = WrongQuestionSchema.extend({
    options: z.array(z.string()),
    explanation: z.string(),
    questionType: z.string(),
    historyLogs: z.array(z.object({
        timestamp: z.string(),
        userAnswer: z.string(),
        isCorrect: z.boolean(),
    })),
})

// ==================== GET / — 错题列表 ====================

const getListRoute = createRoute({
    method: 'get',
    path: '/',
    middleware: [authMiddleware] as const,
    responses: {
        200: {
            content: { 'application/json': { schema: z.array(WrongQuestionSchema) } },
            description: '获取错题列表（排除已掌握）',
        },
    },
})

app.openapi(getListRoute, async (c) => {
    const user = getCurrentUser(c)
    const rows = db.prepare(`
        SELECT 
            l.question_id as questionId,
            q.content as questionContent,
            q.tags,
            q.answer as correctAnswer,
            COUNT(*) as wrongCount,
            MAX(l.timestamp) as lastWrongAt,
            (SELECT user_answer FROM practice_logs 
             WHERE question_id = l.question_id AND user_id = ? AND is_correct = 0 
             ORDER BY timestamp DESC LIMIT 1) as userLastAnswer
        FROM practice_logs l
        JOIN questions q ON l.question_id = q.id
        WHERE l.user_id = ? AND l.is_correct = 0
            AND l.question_id NOT IN (SELECT question_id FROM mastered_questions WHERE user_id = ?)
        GROUP BY l.question_id
        ORDER BY wrongCount DESC, lastWrongAt DESC
    `).all(user.id, user.id, user.id) as any[]

    const result = rows.map(r => ({
        questionId: String(r.questionId),
        questionContent: r.questionContent,
        tags: JSON.parse(r.tags || '[]'),
        wrongCount: r.wrongCount,
        lastWrongAt: r.lastWrongAt || '',
        correctAnswer: r.correctAnswer,
        userLastAnswer: r.userLastAnswer || '',
    }))

    return c.json(result, 200)
})

// ==================== GET /by-tag — 按知识点分组 ====================

const getByTagRoute = createRoute({
    method: 'get',
    path: '/by-tag',
    middleware: [authMiddleware] as const,
    responses: {
        200: {
            content: { 'application/json': { schema: z.array(WrongQuestionsByTagSchema) } },
            description: '按知识点分组的错题',
        },
    },
})

app.openapi(getByTagRoute, async (c) => {
    const user = getCurrentUser(c)
    // 复用上面的查询逻辑
    const rows = db.prepare(`
        SELECT 
            l.question_id as questionId,
            q.content as questionContent,
            q.tags,
            q.answer as correctAnswer,
            COUNT(*) as wrongCount,
            MAX(l.timestamp) as lastWrongAt,
            (SELECT user_answer FROM practice_logs 
             WHERE question_id = l.question_id AND user_id = ? AND is_correct = 0 
             ORDER BY timestamp DESC LIMIT 1) as userLastAnswer
        FROM practice_logs l
        JOIN questions q ON l.question_id = q.id
        WHERE l.user_id = ? AND l.is_correct = 0
            AND l.question_id NOT IN (SELECT question_id FROM mastered_questions WHERE user_id = ?)
        GROUP BY l.question_id
        ORDER BY wrongCount DESC, lastWrongAt DESC
    `).all(user.id, user.id, user.id) as any[]

    const questions = rows.map(r => ({
        questionId: String(r.questionId),
        questionContent: r.questionContent,
        tags: JSON.parse(r.tags || '[]') as string[],
        wrongCount: r.wrongCount,
        lastWrongAt: r.lastWrongAt || '',
        correctAnswer: r.correctAnswer,
        userLastAnswer: r.userLastAnswer || '',
    }))

    // 按 tag 分组
    const tagMap = new Map<string, typeof questions>()
    questions.forEach(q => {
        q.tags.forEach(tag => {
            if (!tagMap.has(tag)) tagMap.set(tag, [])
            tagMap.get(tag)!.push(q)
        })
    })

    const result = Array.from(tagMap.entries())
        .map(([tag, qs]) => ({ tag, count: qs.length, questions: qs }))
        .sort((a, b) => b.count - a.count)

    return c.json(result, 200)
})

// ==================== GET /stats — 统计 ====================

const getStatsRoute = createRoute({
    method: 'get',
    path: '/stats',
    middleware: [authMiddleware] as const,
    responses: {
        200: {
            content: { 'application/json': { schema: StatsSchema } },
            description: '错题统计',
        },
    },
})

app.openapi(getStatsRoute, async (c) => {
    const user = getCurrentUser(c)

    const totalRow = db.prepare(`
        SELECT COUNT(DISTINCT question_id) as count
        FROM practice_logs
        WHERE user_id = ? AND is_correct = 0
    `).get(user.id) as { count: number }

    const recentRow = db.prepare(`
        SELECT COUNT(DISTINCT question_id) as count
        FROM practice_logs
        WHERE user_id = ? AND is_correct = 0 
        AND date(timestamp) >= date('now', '-7 days')
    `).get(user.id) as { count: number }

    const frequentRow = db.prepare(`
        SELECT COUNT(*) as count FROM (
            SELECT question_id, COUNT(*) as cnt
            FROM practice_logs
            WHERE user_id = ? AND is_correct = 0
            GROUP BY question_id
            HAVING cnt >= 2
        )
    `).get(user.id) as { count: number }

    return c.json({
        total: totalRow.count,
        recent: recentRow.count,
        frequent: frequentRow.count,
    }, 200)
})

// ==================== GET /:id — 单题详情 ====================

const getDetailRoute = createRoute({
    method: 'get',
    path: '/:id',
    middleware: [authMiddleware] as const,
    request: {
        params: z.object({ id: z.string() }),
    },
    responses: {
        200: {
            content: { 'application/json': { schema: WrongQuestionDetailSchema } },
            description: '错题详情（含历史作答）',
        },
        404: { description: '未找到题目' },
    },
})

app.openapi(getDetailRoute, async (c) => {
    const user = getCurrentUser(c)
    const { id } = c.req.valid('param')

    const question = db.prepare(`
        SELECT id, content, options, answer, explanation, tags, type
        FROM questions WHERE id = ?
    `).get(id) as any

    if (!question) return c.json({ error: '未找到题目' }, 404)

    const wrongStats = db.prepare(`
        SELECT COUNT(*) as wrongCount, MAX(timestamp) as lastWrongAt
        FROM practice_logs 
        WHERE question_id = ? AND user_id = ? AND is_correct = 0
    `).get(id, user.id) as any

    const historyLogs = db.prepare(`
        SELECT timestamp, user_answer as userAnswer, is_correct as isCorrect
        FROM practice_logs 
        WHERE question_id = ? AND user_id = ?
        ORDER BY timestamp DESC LIMIT 20
    `).all(id, user.id) as any[]

    const lastWrongAnswer = db.prepare(`
        SELECT user_answer FROM practice_logs 
        WHERE question_id = ? AND user_id = ? AND is_correct = 0 
        ORDER BY timestamp DESC LIMIT 1
    `).get(id, user.id) as any

    return c.json({
        questionId: String(question.id),
        questionContent: question.content,
        options: JSON.parse(question.options || '[]'),
        correctAnswer: question.answer,
        explanation: question.explanation || '',
        tags: JSON.parse(question.tags || '[]'),
        questionType: question.type || 'single',
        wrongCount: wrongStats?.wrongCount || 0,
        lastWrongAt: wrongStats?.lastWrongAt || '',
        userLastAnswer: lastWrongAnswer?.user_answer || '',
        historyLogs: historyLogs.map(log => ({
            timestamp: log.timestamp,
            userAnswer: log.userAnswer,
            isCorrect: Boolean(log.isCorrect),
        })),
    }, 200)
})

// ==================== POST /practice — 创建错题练习 ====================

const CreatePracticeSchema = z.object({
    questionIds: z.array(z.string()).min(1),
})

const createPracticeRoute = createRoute({
    method: 'post',
    path: '/practice',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: { 'application/json': { schema: CreatePracticeSchema } },
        },
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: z.object({
                        success: z.boolean(),
                        sessionId: z.string().optional(),
                        message: z.string().optional(),
                    }),
                },
            },
            description: '创建错题练习会话',
        },
    },
})

app.openapi(createPracticeRoute, async (c) => {
    const user = getCurrentUser(c)
    const { questionIds } = c.req.valid('json')

    const sessionId = `wrong-${Date.now()}`

    db.prepare(`
        INSERT INTO practice_sessions (id, user_id, total_questions, correct_count, review_count, practice_mode, questions_json)
        VALUES (?, ?, ?, 0, 0, 'review', ?)
    `).run(sessionId, user.id, questionIds.length, JSON.stringify(questionIds))

    return c.json({ success: true, sessionId }, 200)
})

// ==================== POST /:id/master — 标记已掌握 ====================

const masterRoute = createRoute({
    method: 'post',
    path: '/:id/master',
    middleware: [authMiddleware] as const,
    request: {
        params: z.object({ id: z.string() }),
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: z.object({ success: z.boolean(), message: z.string().optional() }),
                },
            },
            description: '标记错题为已掌握',
        },
    },
})

app.openapi(masterRoute, async (c) => {
    const user = getCurrentUser(c)
    const { id } = c.req.valid('param')

    db.prepare(`
        INSERT OR REPLACE INTO mastered_questions (user_id, question_id, note, mastered_at)
        VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
    `).run(user.id, id)

    return c.json({ success: true }, 200)
})

// ==================== DELETE /:id/master — 取消掌握 ====================

const unmasterRoute = createRoute({
    method: 'delete',
    path: '/:id/master',
    middleware: [authMiddleware] as const,
    request: {
        params: z.object({ id: z.string() }),
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: z.object({ success: z.boolean(), message: z.string().optional() }),
                },
            },
            description: '取消已掌握标记',
        },
    },
})

app.openapi(unmasterRoute, async (c) => {
    const user = getCurrentUser(c)
    const { id } = c.req.valid('param')

    return c.json({ success: true }, 200)
})

// ==================== GET /random — 随机抽题 (智能权重) ====================

const getRandomRoute = createRoute({
    method: 'get',
    path: '/random',
    middleware: [authMiddleware] as const,
    request: {
        query: z.object({
            count: z.string().optional().default('10').describe('抽题数量'),
            tag: z.string().optional().describe('按知识点筛选'),
            mode: z.enum(['priority', 'random']).optional().default('priority').describe('抽题模式: priority=加权优先, random=纯随机'),
        }),
    },
    responses: {
        200: {
            content: { 'application/json': { schema: z.array(WrongQuestionSchema) } },
            description: '随机获取一组错题',
        },
    },
})

app.openapi(getRandomRoute, async (c) => {
    const user = getCurrentUser(c)
    const { count, tag, mode } = c.req.valid('query')
    const limitNum = Math.min(parseInt(count), 50)

    // 核心加权随机 SQL
    // 权重计算公示: (错误次数 * 5 + 遗忘天数 * 2) * 随机系数 (0-1)
    const priorityOrder = `
        (
            COUNT(*) * 5.0 + 
            (JULIANDAY('now') - JULIANDAY(MAX(l.timestamp))) * 2.0
        ) * (ABS(RANDOM() % 1000) / 1000.0) DESC
    `
    const randomOrder = `RANDOM()`

    const tagFilter = tag ? `AND EXISTS (SELECT 1 FROM json_each(q.tags) WHERE value = ?)` : ''
    const params: (string | number)[] = [user.id, user.id, user.id, user.id]
    if (tag) params.push(tag)
    params.push(limitNum)

    const sql = `
        SELECT 
            l.question_id as questionId,
            q.content as questionContent,
            q.tags,
            q.answer as correctAnswer,
            COUNT(*) as wrongCount,
            MAX(l.timestamp) as lastWrongAt,
            (SELECT user_answer FROM practice_logs 
             WHERE question_id = l.question_id AND user_id = l.user_id AND is_correct = 0 
             ORDER BY timestamp DESC LIMIT 1) as userLastAnswer
        FROM practice_logs l
        JOIN questions q ON l.question_id = q.id
        WHERE l.user_id = ? AND l.is_correct = 0
            AND l.question_id NOT IN (SELECT question_id FROM mastered_questions WHERE user_id = ?)
            ${tagFilter}
        GROUP BY l.question_id
        ORDER BY ${mode === 'priority' ? priorityOrder : randomOrder}
        LIMIT ?
    `

    const rows = db.prepare(sql).all(...params) as any[]

    const result = rows.map(r => ({
        questionId: String(r.questionId),
        questionContent: r.questionContent,
        tags: JSON.parse(r.tags || '[]'),
        wrongCount: r.wrongCount,
        lastWrongAt: r.lastWrongAt || '',
        correctAnswer: r.correctAnswer,
        userLastAnswer: r.userLastAnswer || '',
    }))

    return c.json(result, 200)
})

export default app
