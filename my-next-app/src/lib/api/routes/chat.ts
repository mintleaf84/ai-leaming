import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getErrorMessage } from '@/lib/utils/error';
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'
import { streamChatWrapper } from '@/lib/ai/client'
import { saveMessage } from '@/lib/services/chat'
import { 
    buildEnhancedSystemPrompt, 
    parseCommand, 
    handleQuizCommand, 
    handleExplainCommand 
} from '@/lib/services/chat-rag'
import { checkQuotaForApi } from '@/lib/billing/usage-middleware'

const app = new OpenAPIHono()

const ChatSchema = z.object({
    messages: z.array(z.any()),
    sessionId: z.number().optional(),
    enableRag: z.boolean().optional(),
    context: z.string().optional(),
    mode: z.enum(['standard', 'socratic']).optional()
})

const chatRoute = createRoute({
    method: 'post',
    path: '/',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: ChatSchema
                }
            }
        }
    },
    responses: {
        200: { description: '成功 (流式或指令响应)' },
        401: { description: '未授权' },
        429: { description: '配额超限' },
        500: { description: '服务器错误' }
    }
})

app.openapi(chatRoute, async (c) => {
    const user = getCurrentUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    const userId = user.id

    const { messages, sessionId, enableRag, context, mode } = c.req.valid('json')

    // 1. 用量检查
    const quotaCheck = checkQuotaForApi(userId, 'ai_chat')
    if (quotaCheck) return c.json(quotaCheck.error, 429)

    // 2. 保存用户消息
    if (sessionId && messages.length > 0) {
        const lastMessage = messages[messages.length - 1]
        if (lastMessage.role === 'user') {
            try { saveMessage(userId, sessionId, 'user', lastMessage.content) } catch {}
        }
    }

    // 3. 检查指令
    const userMessage = messages[messages.length - 1]?.content || ''
    const { type, keyword } = parseCommand(userMessage)

    if (type !== 'none') {
        let commandResponse = ''
        if (type === 'quiz') commandResponse = await handleQuizCommand(keyword)
        else if (type === 'explain') commandResponse = await handleExplainCommand(keyword)

        if (sessionId) {
            try { saveMessage(userId, sessionId, 'assistant', commandResponse) } catch {}
        }
        return c.text(commandResponse, 200, { 'Content-Type': 'text/plain; charset=utf-8' })
    }

    // 4. 流式生成
    let tools = undefined
    const systemPrompt = buildEnhancedSystemPrompt(context, mode)

    if (enableRag) {
        const { knowledgeSearchTool } = await import('@/lib/services/chat-rag')
        tools = { knowledgeSearch: knowledgeSearchTool }
    }

    try {
        const result = await streamChatWrapper(
            messages,
            (fullResponse) => {
                if (sessionId) {
                    try { saveMessage(userId, sessionId, 'assistant', fullResponse) } catch {}
                }
            },
            tools,
            systemPrompt
        )

        // Hono 允许返回原生的 Response 对象
        return result.toTextStreamResponse()
    } catch (error: unknown) {
        console.error('[Hono Chat API] error:', error)
        return c.json({ error: getErrorMessage(error) }, 500)
    }
})

export default app
