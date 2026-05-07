import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'
import { pdfImportService } from '@/lib/services/pdf-import'

const app = new OpenAPIHono()

// POST /preview — multipart/form-data 接收 PDF 文件
const previewDef = createRoute({
    method: 'post',
    path: '/preview',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'multipart/form-data': {
                    schema: z.object({
                        file: z.any(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: { 'application/json': { schema: z.any() } },
            description: '预览结果',
        },
        400: { description: '无效文件' },
        500: { description: '解析失败' },
    },
})

app.openapi(previewDef, async (c) => {
    const user = getCurrentUser(c)

    try {
        const body = await c.req.parseBody()
        const file = body['file'] as File

        if (!file) return c.json({ error: '请上传文件' }, 400)
        if (file.type !== 'application/pdf') return c.json({ error: '请上传 PDF 文件' }, 400)

        const MAX_SIZE = 50 * 1024 * 1024
        if (file.size > MAX_SIZE) {
            return c.json({ error: `文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，上限 50MB` }, 400)
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const result = await pdfImportService.parseAndPreview(buffer, file.name, file.type)

        return c.json(result, 200)
    } catch (e) {
        console.error('[PdfImportRoute] preview failed:', e)
        return c.json({ error: `解析失败: ${(e as Error).message}` }, 500)
    }
})

// POST /confirm — JSON body
const confirmDef = createRoute({
    method: 'post',
    path: '/confirm',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        questions: z.array(z.object({
                            content: z.string(),
                            options: z.array(z.string()),
                            type: z.enum(['single', 'multi']),
                            answer: z.string(),
                            explanation: z.string(),
                            confidence: z.number(),
                            tags: z.array(z.string()),
                        })),
                        folderId: z.number().optional(),
                        addToWrongBook: z.boolean().default(true),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: { 'application/json': { schema: z.any() } },
            description: '导入结果',
        },
        500: { description: '导入失败' },
    },
})

app.openapi(confirmDef, async (c) => {
    const user = getCurrentUser(c)

    try {
        const body = await c.req.valid('json')
        const result = await pdfImportService.confirmImport(
            user.id,
            body.questions,
            body.folderId,
            body.addToWrongBook,
        )
        return c.json(result, 200)
    } catch (e) {
        console.error('[PdfImportRoute] confirm failed:', e)
        return c.json({ error: `导入失败: ${(e as Error).message}` }, 500)
    }
})

export default app
