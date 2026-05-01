import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { drizzleDb, drizzleSchema } from '@/lib/db'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'
import { eq, and, sql, desc, count, notInArray } from 'drizzle-orm'

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
    const userId = Number(user.id)

    const masteredSubquery = drizzleDb
        .select({ id: drizzleSchema.mastered_questions.question_id })
        .from(drizzleSchema.mastered_questions)
        .where(eq(drizzleSchema.mastered_questions.user_id, userId));

    const rows = await drizzleDb
        .select({
            questionId: drizzleSchema.practice_logs.question_id,
            questionContent: drizzleSchema.questions.content,
            tags: drizzleSchema.questions.tags,
            correctAnswer: drizzleSchema.questions.answer,
            wrongCount: count(),
            lastWrongAt: sql<string>`MAX(${drizzleSchema.practice_logs.timestamp})`,
            userLastAnswer: sql<string>`(SELECT user_answer FROM practice_logs 
                             WHERE question_id = ${drizzleSchema.practice_logs.question_id} 
                             AND user_id = ${userId} AND is_correct = 0 
                             ORDER BY timestamp DESC LIMIT 1)`
        })
        .from(drizzleSchema.practice_logs)
        .innerJoin(drizzleSchema.questions, eq(drizzleSchema.practice_logs.question_id, drizzleSchema.questions.id))
        .where(and(
            eq(drizzleSchema.practice_logs.user_id, userId),
            eq(drizzleSchema.practice_logs.is_correct, false),
            notInArray(drizzleSchema.practice_logs.question_id, masteredSubquery)
        ))
        .groupBy(drizzleSchema.practice_logs.question_id)
        .orderBy(desc(sql`wrongCount`), desc(sql`lastWrongAt`))
        .all();

    const result = rows.map(r => ({
        questionId: String(r.questionId),
        questionContent: String(r.questionContent),
        tags: JSON.parse(r.tags || '[]') as string[],
        wrongCount: Number(r.wrongCount),
        lastWrongAt: r.lastWrongAt || '',
        correctAnswer: String(r.correctAnswer),
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
    const userId = Number(user.id)

    const masteredSubquery = drizzleDb
        .select({ id: drizzleSchema.mastered_questions.question_id })
        .from(drizzleSchema.mastered_questions)
        .where(eq(drizzleSchema.mastered_questions.user_id, userId));

    const rows = await drizzleDb
        .select({
            questionId: drizzleSchema.practice_logs.question_id,
            questionContent: drizzleSchema.questions.content,
            tags: drizzleSchema.questions.tags,
            correctAnswer: drizzleSchema.questions.answer,
            wrongCount: count(),
            lastWrongAt: sql<string>`MAX(${drizzleSchema.practice_logs.timestamp})`,
            userLastAnswer: sql<string>`(SELECT user_answer FROM practice_logs 
                             WHERE question_id = ${drizzleSchema.practice_logs.question_id} 
                             AND user_id = ${userId} AND is_correct = 0 
                             ORDER BY timestamp DESC LIMIT 1)`
        })
        .from(drizzleSchema.practice_logs)
        .innerJoin(drizzleSchema.questions, eq(drizzleSchema.practice_logs.question_id, drizzleSchema.questions.id))
        .where(and(
            eq(drizzleSchema.practice_logs.user_id, userId),
            eq(drizzleSchema.practice_logs.is_correct, false),
            notInArray(drizzleSchema.practice_logs.question_id, masteredSubquery)
        ))
        .groupBy(drizzleSchema.practice_logs.question_id)
        .orderBy(desc(sql`wrongCount`), desc(sql`lastWrongAt`))
        .all();

    const questions = rows.map(r => ({
        questionId: String(r.questionId),
        questionContent: String(r.questionContent),
        tags: JSON.parse(r.tags || '[]') as string[],
        wrongCount: Number(r.wrongCount),
        lastWrongAt: r.lastWrongAt || '',
        correctAnswer: String(r.correctAnswer),
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
    const userId = Number(user.id)

    const totalStats = await drizzleDb
        .select({ count: sql<number>`COUNT(DISTINCT ${drizzleSchema.practice_logs.question_id})` })
        .from(drizzleSchema.practice_logs)
        .where(and(eq(drizzleSchema.practice_logs.user_id, userId), eq(drizzleSchema.practice_logs.is_correct, false)));

    const recentStats = await drizzleDb
        .select({ count: sql<number>`COUNT(DISTINCT ${drizzleSchema.practice_logs.question_id})` })
        .from(drizzleSchema.practice_logs)
        .where(and(
            eq(drizzleSchema.practice_logs.user_id, userId),
            eq(drizzleSchema.practice_logs.is_correct, false),
            sql`date(${drizzleSchema.practice_logs.timestamp}) >= date('now', '-7 days')`
        ));

    const frequentRows = await drizzleDb
        .select({ cnt: count() })
        .from(drizzleSchema.practice_logs)
        .where(and(eq(drizzleSchema.practice_logs.user_id, userId), eq(drizzleSchema.practice_logs.is_correct, false)))
        .groupBy(drizzleSchema.practice_logs.question_id)
        .having(sql`count(*) >= 2`)
        .all();

    return c.json({
        total: Number(totalStats[0]?.count ?? 0),
        recent: Number(recentStats[0]?.count ?? 0),
        frequent: frequentRows.length,
    }, 200)
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
    const userId = Number(user.id)
    const { count: limitStr, tag, mode } = c.req.valid('query')
    const limitNum = Math.min(parseInt(limitStr), 50)

    const priorityOrder = sql`(
            COUNT(*) * 5.0 + 
            (JULIANDAY('now') - JULIANDAY(MAX(${drizzleSchema.practice_logs.timestamp}))) * 2.0
        ) * (ABS(RANDOM() % 1000) / 1000.0) DESC`
    
    const randomOrder = sql`RANDOM()`

    const masteredSubquery = drizzleDb
        .select({ id: drizzleSchema.mastered_questions.question_id })
        .from(drizzleSchema.mastered_questions)
        .where(eq(drizzleSchema.mastered_questions.user_id, userId));

    let query = drizzleDb
        .select({
            questionId: drizzleSchema.practice_logs.question_id,
            questionContent: drizzleSchema.questions.content,
            tags: drizzleSchema.questions.tags,
            correctAnswer: drizzleSchema.questions.answer,
            wrongCount: count(),
            lastWrongAt: sql<string>`MAX(${drizzleSchema.practice_logs.timestamp})`,
            userLastAnswer: sql<string>`(SELECT user_answer FROM practice_logs 
                             WHERE question_id = ${drizzleSchema.practice_logs.question_id} 
                             AND user_id = ${userId} AND is_correct = 0 
                             ORDER BY timestamp DESC LIMIT 1)`
        })
        .from(drizzleSchema.practice_logs)
        .innerJoin(drizzleSchema.questions, eq(drizzleSchema.practice_logs.question_id, drizzleSchema.questions.id))
        .where(and(
            eq(drizzleSchema.practice_logs.user_id, userId),
            eq(drizzleSchema.practice_logs.is_correct, false),
            notInArray(drizzleSchema.practice_logs.question_id, masteredSubquery),
            tag ? sql`EXISTS (SELECT 1 FROM json_each(${drizzleSchema.questions.tags}) WHERE value = ${tag})` : sql`1=1`
        ))
        .groupBy(drizzleSchema.practice_logs.question_id)
        .orderBy(mode === 'priority' ? priorityOrder : randomOrder)
        .limit(limitNum);

    const rows = await query.all();

    const result = rows.map(r => ({
        questionId: String(r.questionId),
        questionContent: String(r.questionContent),
        tags: JSON.parse(r.tags || '[]') as string[],
        wrongCount: Number(r.wrongCount),
        lastWrongAt: r.lastWrongAt || '',
        correctAnswer: String(r.correctAnswer),
        userLastAnswer: r.userLastAnswer || '',
    }))

    return c.json(result, 200)
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
    const userId = Number(user.id)
    const { id } = c.req.valid('param')
    const qId = Number(id)

    const question = await drizzleDb.query.questions.findFirst({
        where: eq(drizzleSchema.questions.id, qId)
    });

    if (!question) return c.json({ error: '未找到题目' }, 404)

    const stats = await drizzleDb
        .select({
            wrongCount: count(),
            lastWrongAt: sql<string>`MAX(${drizzleSchema.practice_logs.timestamp})`
        })
        .from(drizzleSchema.practice_logs)
        .where(and(
            eq(drizzleSchema.practice_logs.question_id, qId),
            eq(drizzleSchema.practice_logs.user_id, userId),
            eq(drizzleSchema.practice_logs.is_correct, false)
        ));

    const historyLogs = await drizzleDb
        .select({
            timestamp: drizzleSchema.practice_logs.timestamp,
            userAnswer: drizzleSchema.practice_logs.user_answer,
            isCorrect: drizzleSchema.practice_logs.is_correct
        })
        .from(drizzleSchema.practice_logs)
        .where(and(
            eq(drizzleSchema.practice_logs.question_id, qId),
            eq(drizzleSchema.practice_logs.user_id, userId)
        ))
        .orderBy(desc(drizzleSchema.practice_logs.timestamp))
        .limit(20)
        .all();

    const lastWrongRow = await drizzleDb
        .select({ user_answer: drizzleSchema.practice_logs.user_answer })
        .from(drizzleSchema.practice_logs)
        .where(and(
            eq(drizzleSchema.practice_logs.question_id, qId),
            eq(drizzleSchema.practice_logs.user_id, userId),
            eq(drizzleSchema.practice_logs.is_correct, false)
        ))
        .orderBy(desc(drizzleSchema.practice_logs.timestamp))
        .limit(1)
        .all();

    return c.json({
        questionId: String(question.id),
        questionContent: String(question.content),
        options: JSON.parse(question.options || '[]') as string[],
        correctAnswer: String(question.answer),
        explanation: question.explanation || '',
        tags: JSON.parse(question.tags || '[]') as string[],
        questionType: question.type || 'single',
        wrongCount: Number(stats[0]?.wrongCount ?? 0),
        lastWrongAt: stats[0]?.lastWrongAt || '',
        userLastAnswer: lastWrongRow[0]?.user_answer || '',
        historyLogs: historyLogs.map(log => ({
            timestamp: log.timestamp || '',
            userAnswer: log.userAnswer || '',
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

    await drizzleDb.insert(drizzleSchema.practice_sessions).values({
        id: sessionId,
        user_id: Number(user.id),
        total_questions: questionIds.length,
        practice_mode: 'review',
        questions_json: JSON.stringify(questionIds)
    });

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

    await drizzleDb.insert(drizzleSchema.mastered_questions).values({
        user_id: Number(user.id),
        question_id: Number(id),
    }).onConflictDoUpdate({
        target: [drizzleSchema.mastered_questions.user_id, drizzleSchema.mastered_questions.question_id],
        set: { mastered_at: sql`CURRENT_TIMESTAMP` }
    });

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
    
    await drizzleDb.delete(drizzleSchema.mastered_questions)
        .where(and(
            eq(drizzleSchema.mastered_questions.user_id, Number(user.id)),
            eq(drizzleSchema.mastered_questions.question_id, Number(id))
        ));

    return c.json({ success: true }, 200)
})

export default app
