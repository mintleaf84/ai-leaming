import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { getErrorMessage } from '@/lib/utils/error';
import {
    createKnowledgeCard,
    getAllKnowledgeCards,
    getCategories,
    getKnowledgeStats,
    exportToAnkiTSV
} from '@/lib/services/knowledge'
import { authMiddleware } from '@/lib/api/middlewares/auth'

const app = new OpenAPIHono()

// --- Schemas ---

const KeyPointSchema = z.object({
    term: z.string(),
    definition: z.string()
})

const KnowledgeCardSchema = z.object({
    id: z.number().optional(),
    session_id: z.number().optional(),
    title: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    front: z.string(),
    back: z.string(),
    key_points: z.array(KeyPointSchema),
    source_content: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional()
})

const CreateCardSchema = z.object({
    title: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    front: z.string().optional(),
    back: z.string().optional(),
    key_points: z.array(KeyPointSchema).optional(),
    session_id: z.number().optional(),
    source_content: z.string().optional()
})

const StatsSchema = z.object({
    total: z.number(),
    byCategory: z.array(z.object({
        category: z.string(),
        count: z.number()
    }))
})

const ListResponseSchema = z.object({
    cards: z.array(KnowledgeCardSchema),
    categories: z.array(z.string()),
    stats: StatsSchema
})

// --- Routes ---

// GET /api/v1/knowledge/cards
const listRoute = createRoute({
    method: 'get',
    path: '/cards',
    middleware: [authMiddleware] as const,
    request: {
        query: z.object({
            category: z.string().optional(),
            limit: z.string().optional().default('100'),
            format: z.string().optional().default('json'),
            ids: z.string().optional().describe('Comma separated IDs')
        })
    },
    responses: {
        200: {
            description: 'List knowledge cards',
            content: {
                'application/json': {
                    schema: ListResponseSchema
                },
                'text/tab-separated-values': {
                    schema: z.string()
                }
            }
        }
    }
})

app.openapi(listRoute, async (c) => {
    const { category, limit, format, ids } = c.req.valid('query')
    const limitNum = parseInt(limit)
    const idList = ids ? ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : undefined

    const cards = getAllKnowledgeCards(category, limitNum, idList)

    // Export to Anki
    if (format === 'anki') {
        const tsv = exportToAnkiTSV(cards)
        return c.text(tsv, 200, {
            'Content-Type': 'text/tab-separated-values; charset=utf-8',
            'Content-Disposition': `attachment; filename="knowledge_cards_${Date.now()}.txt"`
        })
    }

    const stats = getKnowledgeStats()
    const categories = getCategories()

    return c.json({
        cards,
        categories,
        stats
    })
})

// POST /api/v1/knowledge/cards
const createCardRoute = createRoute({
    method: 'post',
    path: '/cards',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: CreateCardSchema
                }
            }
        }
    },
    responses: {
        200: {
            description: 'Card created',
            content: {
                'application/json': {
                    schema: z.object({
                        id: z.number(),
                        message: z.string()
                    })
                }
            }
        },
        500: {
            description: 'Server error'
        }
    }
})

app.openapi(createCardRoute, async (c) => {
    const body = c.req.valid('json')

    try {
        const card = {
            title: body.title || '未命名卡片',
            category: body.category || '',
            tags: body.tags || [],
            front: body.front || '',
            back: body.back || '',
            key_points: body.key_points || [],
            session_id: body.session_id,
            source_content: body.source_content || '',
        }

        const id = await createKnowledgeCard(card)
        return c.json({ id, message: '知识卡片创建成功' })
    } catch (error: unknown) {
        console.error('[Knowledge API] POST error:', error)
        return c.json({ error: getErrorMessage(error) }, 500)
    }
})

// --- Extract Logic ---

const ExtractRequestSchema = z.object({
    content: z.string(),
    sessionId: z.number().optional(),
    instruction: z.string().optional(),
    save: z.boolean().optional().default(true)
})

const extractRoute = createRoute({
    method: 'post',
    path: '/extract',
    middleware: [authMiddleware] as const,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: ExtractRequestSchema
                }
            }
        }
    },
    responses: {
        200: {
            description: 'Knowledge extracted',
            content: {
                'application/json': {
                    schema: z.object({
                        id: z.number().optional(),
                        card: KnowledgeCardSchema.extend({ source_content: z.string().optional() }),
                        suggestions: z.array(z.string()).optional(),
                        message: z.string()
                    })
                }
            }
        },
        422: { description: 'Parsing failed' },
        500: { description: 'Server error' }
    }
})

import { generateTextWrapper } from '@/lib/ai/client'
import { getPromptFromDbSync, buildPrompt, DEFAULT_KNOWLEDGE_EXTRACT_PROMPT } from '@/lib/ai/prompts'

app.openapi(extractRoute, async (c) => {
    const { content, sessionId, instruction, save } = c.req.valid('json')

    try {
        const templateFromDb = getPromptFromDbSync('knowledge_extract')
        const template = templateFromDb || DEFAULT_KNOWLEDGE_EXTRACT_PROMPT

        const extractPrompt = buildPrompt(template, {
            content,
            instruction: instruction ? `\n\n特别指令：${instruction}` : ''
        })

        const { text } = await generateTextWrapper(extractPrompt, 'economy', undefined, undefined, {
            timeout: 30000,
            retries: 1,
        })

        interface ExtractedCard {
            title?: string;
            category?: string;
            tags?: string[];
            front?: string;
            back?: string;
            key_points?: { term: string; definition: string }[];
            suggestions?: string[];
        }

        let rawCardData: ExtractedCard;
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            try {
                rawCardData = JSON.parse(jsonMatch[0]);
            } catch (_e) {
                return c.json({ error: '解析知识卡片失败', raw: text }, 422)
            }
        } else {
            return c.json({ error: '无法解析 AI 返回的 JSON', raw: text }, 422)
        }

        // 基本校验与填充
        const cardData = {
            title: rawCardData.title || '未命名卡片',
            category: rawCardData.category || '',
            tags: rawCardData.tags || [],
            front: rawCardData.front || rawCardData.title || '',
            back: rawCardData.back || '',
            key_points: rawCardData.key_points || [],
            suggestions: rawCardData.suggestions || [],
            source_content: content
        }

        const suggestions = cardData.suggestions
        // @ts-expect-error - suggestions is not part of createKnowledgeCard input
        delete cardData.suggestions

        if (!save) {
            return c.json({
                card: cardData,
                suggestions,
                message: '知识卡片提取成功（预览）'
            })
        }

        const id = await createKnowledgeCard({
            ...cardData,
            session_id: sessionId
        })

        return c.json({
            id,
            card: { id, ...cardData },
            message: '知识卡片提取成功'
        })
    } catch (error: unknown) {
        console.error('[Knowledge Extract API] error:', error)
        return c.json({ error: getErrorMessage(error) }, 500)
    }
})

export default app
