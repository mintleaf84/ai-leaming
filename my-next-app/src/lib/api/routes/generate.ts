import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getErrorMessage } from '@/lib/utils/error';
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'
import { streamText } from 'ai'
import { getAiConfig, getModel } from '@/lib/ai/client'
import { checkAndConsumeQuota } from '@/lib/billing/subscription-service'

const app = new OpenAPIHono()

import { buildSystemPrompt, type GenerateOption } from '@/lib/ai/prompts'

const GenerateSchema = z.object({
    prompt: z.string(),
    option: z.enum(['continue', 'improve', 'fix', 'shorter', 'longer', 'zap'] as [GenerateOption, ...GenerateOption[]]),
    command: z.string().optional()
})

const generateRoute = createRoute({
    method: 'post',
    path: '/',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: GenerateSchema
                }
            }
        }
    },
    responses: {
        200: { description: '成功 (流式响应)' },
        401: { description: '未授权' },
        403: { description: '配额不足' },
        500: { description: '服务器错误' }
    }
})

app.openapi(generateRoute, async (c) => {
    const user = getCurrentUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    const userId = Number(user.id)

    const quota = checkAndConsumeQuota(userId, 'ai_chat')
    if (!quota.allowed) return c.text('配额不足，请升级套餐', 403)

    const { prompt, option, command } = c.req.valid('json')
    const config = getAiConfig('premium')

    const systemPrompt = buildSystemPrompt(option, command)

    try {
        // 使用 getModel 以兼容不同 provider 形态
        const model = getModel(config.apiKey, config.baseURL, config.modelName || 'gpt-4o')

        const response = streamText({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
        })
        return response.toTextStreamResponse()
    } catch (error: unknown) {
        console.error('[Hono Generate API] error:', error)
        return c.json({ error: getErrorMessage(error) }, 500)
    }
})

export default app
