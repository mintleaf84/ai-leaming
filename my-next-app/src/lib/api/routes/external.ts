import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { drizzleDb, drizzleSchema } from '@/lib/db'
import { eq, sql, count, desc } from 'drizzle-orm'

const app = new OpenAPIHono()

// ==================== 鉴权中间件 ====================
// 从数据库校验 API Key，支持后台动态开关

app.use('*', async (c, next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: '缺少 Authorization Header (Bearer <key>)' }, 401)
    }

    const token = authHeader.slice(7) // 去掉 "Bearer "
    try {
        const row = await drizzleDb.query.api_keys.findFirst({
            where: eq(drizzleSchema.api_keys.key_string, token),
            columns: { id: true, is_active: true }
        });

        if (!row) {
            return c.json({ error: 'API Key 无效' }, 401)
        }
        if (!row.is_active) {
            return c.json({ error: '此 API Key 已被后台停用' }, 403)
        }
    } catch (err) {
        console.error('[ExternalAPI] 鉴权查询失败:', err)
        return c.json({ error: '服务器内部错误' }, 500)
    }

    await next()
})

// ==================== Schema 定义 ====================

const ExternalQuestionSchema = z.object({
    id: z.number(),
    type: z.string().nullable().optional(),
    dimension: z.string().nullable().optional(),
    content: z.string(),
    options: z.array(z.string()),
    answer: z.string(),
    explanation: z.string().nullable().optional(),
    tags: z.array(z.string()),
})

const ExternalQuestionListSchema = z.object({
    data: z.array(ExternalQuestionSchema),
    pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
    }),
})

// ==================== 路由：获取题库列表 ====================

const listRoute = createRoute({
    method: 'get',
    path: '/questions',
    request: {
        query: z.object({
            page: z.string().optional().default('1'),
            limit: z.string().optional().default('20'),
            tag: z.string().optional(),
        }),
    },
    responses: {
        200: {
            content: {
                'application/json': { schema: ExternalQuestionListSchema },
            },
            description: '获取题库列表（分页）',
        },
        401: { description: '未授权 - 缺少或无效的 API Key' },
        403: { description: '已禁止 - API Key 被后台停用' },
    },
})

app.openapi(listRoute, async (c) => {
    const { page, limit, tag } = c.req.valid('query')
    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))) // 限制最大 100
    const offset = (pageNum - 1) * limitNum

    const whereClause = tag ? sql`EXISTS (SELECT 1 FROM json_each(${drizzleSchema.questions.tags}) WHERE value = ${tag})` : undefined;

    const [totalRow] = await drizzleDb.select({ value: count() })
        .from(drizzleSchema.questions)
        .where(whereClause);

    const rows = await drizzleDb.select({
        id: drizzleSchema.questions.id,
        type: drizzleSchema.questions.type,
        dimension: drizzleSchema.questions.dimension,
        content: drizzleSchema.questions.content,
        options: drizzleSchema.questions.options,
        answer: drizzleSchema.questions.answer,
        explanation: drizzleSchema.questions.explanation,
        tags: drizzleSchema.questions.tags
    })
    .from(drizzleSchema.questions)
    .where(whereClause)
    .orderBy(drizzleSchema.questions.id)
    .limit(limitNum)
    .offset(offset)
    .all();

    // 反序列化 JSON 字符串字段
    const data = rows.map((row) => ({
        id: row.id,
        type: row.type || null,
        dimension: (row.dimension as string) || null,
        content: row.content,
        options: safeJsonParse(row.options as string | null | undefined, []),
        answer: row.answer || '',
        explanation: row.explanation || null,
        tags: safeJsonParse(row.tags as string | null | undefined, []),
    }))

    return c.json({
        data,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalRow.value,
            totalPages: Math.ceil(totalRow.value / limitNum),
        },
    })
})

// ==================== 路由：获取单道题目详情 ====================

const getRoute = createRoute({
    method: 'get',
    path: '/questions/:id',
    request: {
        params: z.object({ id: z.string() }),
    },
    responses: {
        200: {
            content: {
                'application/json': { schema: ExternalQuestionSchema },
            },
            description: '获取单道题目详情',
        },
        404: { description: '题目不存在' },
    },
})

app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param')
    
    const row = await drizzleDb.query.questions.findFirst({
        where: eq(drizzleSchema.questions.id, parseInt(id))
    });

    if (!row) {
        return c.json({ error: '题目不存在' }, 404)
    }

    return c.json({
        id: row.id,
        type: row.type || null,
        dimension: (row.dimension as string) || null,
        content: row.content,
        options: safeJsonParse(row.options as string | null | undefined, []),
        answer: row.answer || '',
        explanation: row.explanation || null,
        tags: safeJsonParse(row.tags as string | null | undefined, []),
    })
})

// ==================== 工具函数 ====================

function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
    if (!str) return fallback
    try {
        return JSON.parse(str)
    } catch {
        return fallback
    }
}

export default app
