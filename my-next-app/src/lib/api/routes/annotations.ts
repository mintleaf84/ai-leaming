import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'
import { drizzleDb, drizzleSchema } from '@/lib/db'
import { eq, and, asc } from 'drizzle-orm'

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
    const annotations = await drizzleDb.select({
        id: drizzleSchema.text_annotations.id,
        startOffset: drizzleSchema.text_annotations.start_offset,
        endOffset: drizzleSchema.text_annotations.end_offset,
        tag: drizzleSchema.text_annotations.tag,
        color: drizzleSchema.text_annotations.color,
        created_at: drizzleSchema.text_annotations.created_at
    })
    .from(drizzleSchema.text_annotations)
    .where(and(
        eq(drizzleSchema.text_annotations.user_id, user.id),
        eq(drizzleSchema.text_annotations.question_id, parseInt(questionId))
    ))
    .orderBy(asc(drizzleSchema.text_annotations.start_offset));

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
    
    const result = await drizzleDb.insert(drizzleSchema.text_annotations).values({
        user_id: user.id,
        question_id: questionId,
        start_offset: startOffset,
        end_offset: endOffset,
        tag: tag,
        color: color || null
    }).onConflictDoUpdate({
        target: [
            drizzleSchema.text_annotations.user_id,
            drizzleSchema.text_annotations.question_id,
            drizzleSchema.text_annotations.start_offset,
            drizzleSchema.text_annotations.end_offset
        ],
        set: {
            tag: tag,
            color: color || null
        }
    });

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
    const result = await drizzleDb.delete(drizzleSchema.text_annotations)
        .where(and(
            eq(drizzleSchema.text_annotations.id, parseInt(id)),
            eq(drizzleSchema.text_annotations.user_id, user.id)
        ));

    if (result.rowsAffected === 0) return c.json({ error: '标注不存在或无权删除' }, 404)
    return c.json({ message: '标注已删除' })
})

export default app
