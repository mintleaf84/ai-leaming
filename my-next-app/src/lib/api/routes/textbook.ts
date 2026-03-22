import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { textbookService } from '@/lib/services/textbook'
import { authMiddleware } from '@/lib/api/middlewares/auth'

const app = new OpenAPIHono()

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
