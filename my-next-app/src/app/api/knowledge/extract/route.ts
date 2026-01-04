import { NextRequest, NextResponse } from 'next/server';
import { generateTextWrapper } from '@/lib/ai-client';
import { createKnowledgeCard } from '@/lib/knowledge-service';
import { getPromptFromDbSync, buildPrompt, DEFAULT_KNOWLEDGE_EXTRACT_PROMPT } from '@/lib/prompts';
import { z } from 'zod';

// 知识卡片结构 Schema
const KnowledgeCardSchema = z.object({
    title: z.string().describe('卡片标题，简洁明了'),
    category: z.string().describe('知识分类，如"教育心理学"、"教育学基础"'),
    tags: z.array(z.string()).describe('相关标签'),
    front: z.string().describe('卡片正面：核心问题或概念名称'),
    back: z.string().describe('卡片背面：详细解答或定义'),
    key_points: z.array(z.object({
        term: z.string(),
        definition: z.string(),
    })).describe('关键知识点列表'),
    suggestions: z.array(z.string()).optional().describe('其他的提取建议'),
});

/**
 * POST /api/knowledge/extract
 * 使用 AI 从对话内容中提取知识卡片
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { content, sessionId, instruction, save = true } = body;

        if (!content) {
            return NextResponse.json({ error: '缺少内容参数' }, { status: 400 });
        }

        // 从数据库获取提示词模板，如果没有则使用默认值
        const templateFromDb = getPromptFromDbSync('knowledge_extract');
        const template = templateFromDb || DEFAULT_KNOWLEDGE_EXTRACT_PROMPT;

        // 构建提取 Prompt
        const extractPrompt = buildPrompt(template, {
            content,
            instruction: instruction ? `\n\n特别指令：${instruction}` : ''
        });

        // 调用 AI 提取知识
        const { text } = await generateTextWrapper(extractPrompt, 'economy', undefined, undefined, {
            timeout: 30000,
            retries: 1,
        });

        // 解析 AI 返回的 JSON
        let cardData;
        try {
            // 尝试提取 JSON
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cardData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('无法解析 AI 返回的 JSON');
            }
        } catch (parseError) {
            console.error('[Extract] JSON parse error:', parseError);
            return NextResponse.json({
                error: '解析知识卡片失败',
                raw: text,
            }, { status: 422 });
        }

        // 验证结构
        const validated = KnowledgeCardSchema.safeParse(cardData);
        if (!validated.success) {
            console.error('[Extract] Validation error:', validated.error);
            // 使用原始数据，填充默认值
            cardData = {
                title: cardData.title || '未命名卡片',
                category: cardData.category || '',
                tags: cardData.tags || [],
                front: cardData.front || cardData.title || '',
                back: cardData.back || '',
                key_points: cardData.key_points || [],
                suggestions: cardData.suggestions || [],
            };
        }

        // 提取 suggestions (如果有)
        const suggestions = cardData.suggestions || [];
        // 清理 cardData 中的 suggestions，以免写入数据库（如果数据库不支持）
        // 但这里我们主要是在 API 返回中使用，createKnowledgeCard 会忽略多余字段

        // 如果不需要保存（预览/重生成模式），直接返回
        if (!save) {
            return NextResponse.json({
                card: { ...cardData, source_content: content },
                suggestions, // 返回建议
                message: '知识卡片提取成功（预览）',
            });
        }

        // 保存到数据库
        const id = createKnowledgeCard({
            ...cardData,
            session_id: sessionId,
            source_content: content,
        });

        return NextResponse.json({
            id,
            card: { id, ...cardData, source_content: content },
            message: '知识卡片提取成功',
        });

    } catch (error: any) {
        console.error('[Knowledge Extract API] error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
