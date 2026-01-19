import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { practiceService } from '@/lib/services/practice'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'

const app = new OpenAPIHono()

const CreateSessionSchema = z.object({
    mode: z.enum(['random', 'wrong', 'tag', 'first-principles']),
    limit: z.number().default(10)
})

const SubmitAnswerSchema = z.object({
    questionId: z.number(),
    userAnswer: z.string(),
    isCorrect: z.boolean(),
    duration: z.number()
})

// Create Session
const createSessionRoute = createRoute({
    method: 'post',
    path: '/session',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': { schema: CreateSessionSchema }
            }
        }
    },
    responses: {
        200: {
            description: 'Session created',
            content: {
                'application/json': {
                    schema: z.object({
                        sessionId: z.string(),
                        questions: z.array(z.object({
                            id: z.number(),
                            content: z.string(),
                            options: z.array(z.string()),
                            type: z.string().optional()
                        }))
                    })
                }
            }
        },
        400: {
            description: 'Invalid input',
            content: {
                'application/json': {
                    schema: z.object({ error: z.string() })
                }
            }
        }
    }
})

app.openapi(createSessionRoute, async (c) => {
    const user = getCurrentUser(c)
    const { mode, limit } = c.req.valid('json')

    // Simplification: only random supported for now via createRandomSession
    if (mode !== 'random') {
        return c.json({ error: 'Only random mode supported currently via API' }, 400)
    }

    const result = await practiceService.createRandomSession(user.id, limit)

    return c.json({
        sessionId: result.sessionId,
        questions: result.questions.map(q => ({
            id: q.id,
            content: q.content,
            options: q.options,
            type: q.type
        }))
    }, 200)
})

// Submit Answer
const submitRoute = createRoute({
    method: 'post',
    path: '/session/:sessionId/submit',
    middleware: [authMiddleware] as const,
    request: {
        params: z.object({ sessionId: z.string() }),
        body: {
            content: {
                'application/json': { schema: SubmitAnswerSchema }
            }
        }
    },
    responses: {
        200: {
            description: 'Answer submitted',
            content: {
                'application/json': {
                    schema: z.object({ success: z.boolean() })
                }
            }
        }
    }
})

app.openapi(submitRoute, async (c) => {
    const user = getCurrentUser(c)
    const { sessionId } = c.req.valid('param')
    const { questionId, userAnswer, isCorrect, duration } = c.req.valid('json')

    await practiceService.submitAnswer(
        user.id,
        sessionId,
        questionId,
        userAnswer,
        isCorrect,
        duration
    )

    return c.json({ success: true })
})

export default app
