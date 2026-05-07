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
        const { taskId, totalChunks } = await pdfImportService.ocrAndSplit(buffer, file.name, file.type)

        return c.json({ taskId, totalChunks }, 200)
    } catch (e) {
        console.error('[PdfImportRoute] preview failed:', e)
        return c.json({ error: `解析失败: ${(e as Error).message}` }, 500)
    }
})

// POST /parse-chunk — 解析单个块
const parseChunkDef = createRoute({
    method: 'post',
    path: '/parse-chunk',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        taskId: z.string(),
                        chunkIndex: z.number().int().min(0),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: { 'application/json': { schema: z.any() } },
            description: '块解析结果',
        },
        400: { description: '无效参数' },
        500: { description: '解析失败' },
    },
})

app.openapi(parseChunkDef, async (c) => {
    const user = getCurrentUser(c)

    try {
        const body = await c.req.valid('json')
        const result = await pdfImportService.parseSingleChunk(body.taskId, body.chunkIndex)
        return c.json(result, 200)
    } catch (e) {
        console.error('[PdfImportRoute] parse-chunk failed:', e)
        return c.json({ error: `解析失败: ${(e as Error).message}` }, 500)
    }
})

// POST /cleanup — 清理缓存（可选，解析全部完成后调用）
const cleanupDef = createRoute({
    method: 'post',
    path: '/cleanup',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({ taskId: z.string() }),
                },
            },
        },
    },
    responses: {
        200: {
            content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
            description: '清理结果',
        },
    },
})

app.openapi(cleanupDef, async (c) => {
    const user = getCurrentUser(c)
    const body = await c.req.valid('json')
    pdfImportService.cleanup(body.taskId)
    return c.json({ ok: true }, 200)
})

// POST /text-import — 手动粘贴文本，跳过 OCR，直接分块
const textImportDef = createRoute({
    method: 'post',
    path: '/text-import',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        text: z.string().min(20, '文本内容过短'),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: { 'application/json': { schema: z.object({ taskId: z.string(), totalChunks: z.number() }) } },
            description: '分块结果',
        },
        400: { description: '无效参数' },
        500: { description: '处理失败' },
    },
})

app.openapi(textImportDef, async (c) => {
    const user = getCurrentUser(c)

    try {
        const body = await c.req.valid('json')
        const { taskId, totalChunks } = await pdfImportService.splitText(body.text)
        return c.json({ taskId, totalChunks }, 200)
    } catch (e) {
        console.error('[PdfImportRoute] text-import failed:', e)
        return c.json({ error: `处理失败: ${(e as Error).message}` }, 500)
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
                            type: z.enum(['single', 'multi', 'truefalse']),
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
