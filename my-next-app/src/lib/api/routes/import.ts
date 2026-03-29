import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { authMiddleware } from '@/lib/api/middlewares/auth'
import { importFenbiDataAction } from '@/server/actions/import'

const app = new OpenAPIHono()

const ImportFenbiSchema = z.object({
    exerciseJson: z.string(),
    solutionsJson: z.string(),
    statsJson: z.string().optional()
})

const ImportResponseSchema = z.object({
    success: z.boolean(),
    sessionId: z.string().optional(),
    importedCount: z.number().optional(),
    newQuestionsCount: z.number().optional(),
    skippedQuestionsCount: z.number().optional(),
    message: z.string(),
    error: z.string().optional()
})

const importRoute = createRoute({
    method: 'post',
    path: '/fenbi-webhook',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: ImportFenbiSchema
                }
            }
        }
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: ImportResponseSchema
                }
            },
            description: 'Import result'
        },
        500: {
            description: 'Server error'
        }
    }
})

app.openapi(importRoute, async (c) => {
    const body = c.req.valid('json')
    
    try {
        const result = await importFenbiDataAction(
            body.exerciseJson,
            body.solutionsJson,
            body.statsJson
        )
        
        return c.json(result, 200)
    } catch (e) {
        return c.json({
            success: false,
            message: `导入失败: ${(e as Error).message}`,
            error: (e as Error).message
        }, 500)
    }
})

export default app
