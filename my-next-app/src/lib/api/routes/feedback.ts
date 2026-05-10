import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'
import { questionFeedbackService } from '@/lib/services/question-feedback-service'

const feedbackRoute = new OpenAPIHono()

const submitFeedbackDef = createRoute({
    method: 'post',
    path: '/',
    middleware: [authMiddleware] as const,
    summary: '提交题目纠错反馈',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        question_id: z.number(),
                        feedback_type: z.enum(['wrong_answer', 'wrong_content', 'wrong_explanation', 'other']),
                        description: z.string().max(500).optional(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: '反馈提交成功',
            content: { 'application/json': { schema: z.object({ success: z.boolean(), id: z.number() }) } },
        },
        400: { description: '参数错误' },
        401: { description: '未授权' },
    },
})

feedbackRoute.openapi(submitFeedbackDef, async (c) => {
    const user = getCurrentUser(c)
    const body = await c.req.valid('json')
    const result = await questionFeedbackService.create({
        question_id: body.question_id,
        user_id: user.id,
        feedback_type: body.feedback_type,
        description: body.description,
    })
    return c.json({ success: true, id: result.id }, 200)
})

export default feedbackRoute
