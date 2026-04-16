import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { textbookService } from '@/lib/services/textbook'
import { authMiddleware } from '@/lib/api/middlewares/auth'
import db from '@/lib/db'

const app = new OpenAPIHono()

// Schema 定义
const TextbookSchema = z.object({
    id: z.number(),
    title: z.string(),
    author: z.string().optional(),
    description: z.string().optional(),
    cover_url: z.string().optional(),
    chapterCount: z.number().describe('章节数量'),
    created_at: z.string(),
})

const TextbookChapterSchema = z.object({
    id: z.number(),
    textbook_id: z.number(),
    title: z.string(),
    order_index: z.number(),
    parent_id: z.number().nullable().optional(),
    level: z.number(),
    created_at: z.string(),
})

const TextbookDetailSchema = TextbookSchema.extend({
    chapters: z.array(TextbookChapterSchema)
})

// ==================== GET / — 教材列表 ====================

const listTextbookDef = createRoute({
    method: 'get',
    path: '/',
    summary: '获取教材列表',
    middleware: [authMiddleware] as const,
    responses: {
        200: {
            description: '教材列表',
            content: {
                'application/json': {
                    schema: z.array(TextbookSchema)
                }
            }
        }
    }
})

app.openapi(listTextbookDef, async (c) => {
    const textbooks = textbookService.getAllTextbooks()

    // 为每本教材附带章节数量
    const result = textbooks.map(tb => {
        const chapterRow = db.prepare(
            'SELECT COUNT(*) as count FROM textbook_chapters WHERE textbook_id = ?'
        ).get(tb.id) as { count: number }
        return {
            id: tb.id,
            title: tb.title,
            author: tb.author,
            description: tb.description,
            cover_url: tb.cover_url,
            chapterCount: chapterRow.count,
            created_at: tb.created_at,
        }
    })

    return c.json(result)
})

// ==================== GET /:id — 教材详情 (含章节) ====================

const getTextbookDef = createRoute({
    method: 'get',
    path: '/:id',
    summary: '获取教材详情（含章节列表）',
    middleware: [authMiddleware] as const,
    request: {
        params: z.object({
            id: z.string().describe('教材ID')
        })
    },
    responses: {
        200: {
            description: '教材详情',
            content: {
                'application/json': {
                    schema: TextbookDetailSchema
                }
            }
        },
        400: { description: '无效ID' },
        404: { description: '教材不存在' },
    }
})

app.openapi(getTextbookDef, async (c) => {
    const { id } = c.req.valid('param')
    const textbookId = parseInt(id)
    if (isNaN(textbookId)) return c.json({ error: 'Invalid ID' }, 400)

    const textbook = textbookService.getTextbook(textbookId)
    if (!textbook) return c.json({ error: '教材不存在' }, 404)

    const chapters = textbookService.getChapters(textbookId)

    return c.json({
        id: textbook.id,
        title: textbook.title,
        author: textbook.author,
        description: textbook.description,
        cover_url: textbook.cover_url,
        chapterCount: chapters.length,
        created_at: textbook.created_at,
        chapters: chapters.map(ch => ({
            id: ch.id,
            textbook_id: ch.textbook_id,
            title: ch.title,
            order_index: ch.order_index,
            parent_id: ch.parent_id ?? null,
            level: ch.level,
            created_at: ch.created_at,
        }))
    })
})

// ==================== DELETE /:id — 删除教材 ====================

const deleteTextbookDef = createRoute({
    method: 'delete',
    path: '/:id',
    summary: '删除教科书',
    middleware: [authMiddleware] as const,
    request: {
        params: z.object({
            id: z.string().describe('教科书ID')
        })
    },
    responses: {
        200: { description: '成功' },
        400: { description: '无效ID' },
        401: { description: '未授权' },
        500: { description: '服务器错误' }
    }
})

app.openapi(deleteTextbookDef, async (c) => {
    try {
        const { id } = c.req.valid('param')
        const textbookId = parseInt(id)
        if (isNaN(textbookId)) return c.json({ error: 'Invalid ID' }, 400)

        await textbookService.deleteTextbook(textbookId)
        return c.json({ success: true })
    } catch (error: any) {
        return c.json({ error: error.message }, 500)
    }
})

export default app
