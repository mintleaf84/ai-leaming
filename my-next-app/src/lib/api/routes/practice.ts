import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getErrorMessage } from '@/lib/utils/error';
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
                    schema: z.object({
                        isCorrect: z.boolean(),
                        correctAnswer: z.string()
                    })
                }
            }
        }
    }
})

app.openapi(submitRoute, async (c) => {
    const user = getCurrentUser(c)
    const { sessionId } = c.req.valid('param')
    const { questionId, userAnswer, duration } = c.req.valid('json')

    const result = await practiceService.submitAnswerWithValidation(
        user.id,
        sessionId,
        questionId,
        userAnswer,
        duration
    )

    return c.json({ isCorrect: result.isCorrect, correctAnswer: result.correctAnswer || '' }, 200)
})

// --- First Principles Logic ---

import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { generateTextWrapper } from '@/lib/ai/client';
import { checkAndConsumeQuota } from '@/lib/billing/subscription-service';

// 确保缓存表存在 (在 LibSQL 环境下，建议通过迁移文件预创表，这里保留作为兜底，改为异步)
async function ensureCacheTable() {
    try {
        await drizzleDb.run(sql`
            CREATE TABLE IF NOT EXISTS first_principles_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_hash TEXT UNIQUE NOT NULL,
                analysis TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await drizzleDb.run(sql`CREATE INDEX IF NOT EXISTS idx_fp_cache_hash ON first_principles_cache(question_hash);`);
    } catch (e) {
        console.error('[FirstPrinciples] 创建缓存表失败:', e);
    }
}

// 生成内容哈希
function generateHash(content: string): string {
    const normalized = content.trim().slice(0, 100) + content.length;
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

const FirstPrinciplesSchema = z.object({
    questionContent: z.string(),
    explanation: z.string().optional(),
    wrongAnswer: z.string().optional(),
    correctAnswer: z.string()
})

const firstPrinciplesRoute = createRoute({
    method: 'post',
    path: '/first-principles',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': { schema: FirstPrinciplesSchema }
            }
        }
    },
    responses: {
        200: {
            description: 'Analysis result',
            content: {
                'application/json': {
                    schema: z.object({
                        analysis: z.string(),
                        cached: z.boolean()
                    })
                }
            }
        },
        403: {
            description: 'Quota exceeded'
        },
        500: {
            description: 'Server error'
        }
    }
})

app.openapi(firstPrinciplesRoute, async (c) => {
    const user = getCurrentUser(c)
    const { questionContent, explanation, wrongAnswer, correctAnswer } = c.req.valid('json')

    try {
        await ensureCacheTable();
        const cacheKey = generateHash(questionContent + correctAnswer + (wrongAnswer || ''));

        // 检查缓存
        const [cached] = await drizzleDb.select({ analysis: drizzleSchema.first_principles_cache.analysis })
            .from(drizzleSchema.first_principles_cache)
            .where(eq(drizzleSchema.first_principles_cache.question_hash, cacheKey))
            .limit(1);

        if (cached) {
            return c.json({ analysis: cached.analysis, cached: true });
        }

        // 检查配额
        const quotaResult = await checkAndConsumeQuota(Number(user.id), 'first_principles');
        if (!quotaResult.allowed) {
            return c.json({ error: quotaResult.message }, 403);
        }

        // 构建 Prompt
        const prompt = `请用"第一性原理"解析这道题。要求：
1. 直接给答案，只说底层逻辑，不超过200字
2. 不要使用黑话，用通俗易懂的语言
3. 严格基于提供的题目内容和选项进行分析，禁止引用题目中未提及的观点，禁止编造不存在的选项。

题目：${questionContent}
正确答案：${correctAnswer}
${wrongAnswer ? `用户选择：${wrongAnswer}` : ''}
${explanation ? `参考解析：${explanation}` : ''}

回复格式：
【答案】X
【核心逻辑】...`;

        // 调用 AI
        let text: string;
        try {
            const result = await generateTextWrapper(prompt, 'economy', undefined, undefined, {
                timeout: 30000,
                retries: 1,
            });
            text = result.text;
        } catch (aiError: unknown) {
            return c.json({ error: `AI 分析失败: ${aiError instanceof Error ? aiError.message : 'Unknown error'}` }, 500);
        }

        // 保存到缓存
        try {
            await drizzleDb.insert(drizzleSchema.first_principles_cache)
                .values({
                    question_hash: cacheKey,
                    analysis: text
                })
                .onConflictDoUpdate({
                    target: drizzleSchema.first_principles_cache.question_hash,
                    set: { analysis: text }
                });
        } catch (cacheError) {
            console.error('[FirstPrinciples] 缓存保存失败:', cacheError);
        }

        return c.json({ analysis: text, cached: false });

    } catch (error: unknown) {
        console.error('[FirstPrinciples API] error:', error);
        return c.json({ error: getErrorMessage(error) }, 500);
    }
})

export default app
