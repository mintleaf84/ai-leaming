import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import db from '@/lib/db'

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
        const row = db.prepare(
            'SELECT id, is_active FROM api_keys WHERE key_string = ?'
        ).get(token) as { id: number; is_active: number } | undefined

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

    // 构建查询（白名单字段，物理隔绝用户信息）
    let whereClause = ''
    const params: (string | number | null)[] = []

    if (tag) {
        // tags 在数据库中以 JSON 数组字符串存储，使用 SQLite json_each 进行精准匹配
        whereClause = 'WHERE EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)'
        params.push(tag)
    }

    const totalRow = db.prepare(
        `SELECT COUNT(*) as count FROM questions ${whereClause}`
    ).get(...params) as { count: number }

    const rows = db.prepare(
        `SELECT id, type, dimension, content, options, answer, explanation, tags
         FROM questions ${whereClause}
         ORDER BY id ASC
         LIMIT ? OFFSET ?`
    ).all(...params, limitNum, offset) as Record<string, unknown>[]

    // 反序列化 JSON 字符串字段
    const data = rows.map((row) => ({
        id: row.id,
        type: row.type || null,
        dimension: row.dimension || null,
        content: row.content,
        options: safeJsonParse(row.options as string | null | undefined, []),
        answer: row.answer,
        explanation: row.explanation || null,
        tags: safeJsonParse(row.tags as string | null | undefined, []),
    }))

    return c.json({
        data,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalRow.count,
            totalPages: Math.ceil(totalRow.count / limitNum),
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
    const row = db.prepare(
        `SELECT id, type, dimension, content, options, answer, explanation, tags
         FROM questions WHERE id = ?`
    ).get(parseInt(id)) as Record<string, unknown> | undefined

    if (!row) {
        return c.json({ error: '题目不存在' }, 404)
    }

    return c.json({
        id: row.id,
        type: row.type || null,
        dimension: row.dimension || null,
        content: row.content,
        options: safeJsonParse(row.options as string | null | undefined, []),
        answer: row.answer,
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
