import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'
import { db } from '@/lib/db'

const app = new OpenAPIHono()

const _AnnotationSchema = z.object({
    id: z.number().optional(),
    startOffset: z.number(),
    endOffset: z.number(),
    tag: z.enum(['highlight', 'underline', 'wavy']),
    color: z.string().nullable()
})

/** GET /api/annotations */
const listAnnotationsDef = createRoute({
    method: 'get',
    path: '/',
    middleware: [authMiddleware] as const,
    request: {
        query: z.object({
            questionId: z.string().describe('题目ID')
        })
    },
    responses: {
        200: { description: '成功' },
        401: { description: '未授权' }
    }
})

app.openapi(listAnnotationsDef, async (c) => {
    const user = getCurrentUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    
    const { questionId } = c.req.valid('query')
    const annotations = db.prepare(`
        SELECT id, start_offset as startOffset, end_offset as endOffset, tag, color, created_at
        FROM text_annotations
        WHERE user_id = ? AND question_id = ?
        ORDER BY start_offset ASC
    `).all(user.id, parseInt(questionId))

    return c.json({ annotations })
})

/** POST /api/annotations */
const createAnnotationDef = createRoute({
    method: 'post',
    path: '/',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        questionId: z.number(),
                        startOffset: z.number(),
                        endOffset: z.number(),
                        tag: z.enum(['highlight', 'underline', 'wavy']),
                        color: z.string().optional()
                    })
                }
            }
        }
    },
    responses: {
        200: { description: '成功' },
        401: { description: '未授权' }
    }
})

app.openapi(createAnnotationDef, async (c) => {
    const user = getCurrentUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const { questionId, startOffset, endOffset, tag, color } = c.req.valid('json')
    const result = db.prepare(`
        INSERT OR REPLACE INTO text_annotations (user_id, question_id, start_offset, end_offset, tag, color)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, questionId, startOffset, endOffset, tag, color || null)

    return c.json({ id: Number(result.lastInsertRowid), message: '标注已保存' })
})

/** DELETE /api/annotations */
const deleteAnnotationDef = createRoute({
    method: 'delete',
    path: '/',
    middleware: [authMiddleware] as const,
    request: {
        query: z.object({
            id: z.string().describe('标注ID')
        })
    },
    responses: {
        200: { description: '成功' },
        404: { description: '不存在' }
    }
})

app.openapi(deleteAnnotationDef, async (c) => {
    const user = getCurrentUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const { id } = c.req.valid('query')
    const result = db.prepare(`
        DELETE FROM text_annotations
        WHERE id = ? AND user_id = ?
    `).run(parseInt(id), user.id)

    if (result.changes === 0) return c.json({ error: '标注不存在或无权删除' }, 404)
    return c.json({ message: '标注已删除' })
})

export default app
