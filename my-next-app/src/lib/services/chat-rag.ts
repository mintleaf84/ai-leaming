import { generateTextWrapper } from '@/lib/ai/client';
import { searchSimilarContent, ragService, type RagResult } from '@/lib/ai/rag';
import { getPromptFromDbSync, SOCRATIC_TUTOR_PROMPT } from '@/lib/ai/prompts';
import { tool } from 'ai';
import { z } from 'zod';

/**
 * 知识库检索工具
 * 让 AI 根据上下文自主决定是否需要检索 
 */
/**
 * 知识库检索工具
 * 让 AI 根据上下文自主决定是否需要检索 
 */
export const knowledgeSearchTool = {
    description: 'Search for educational psychology, pedagogy, and teacher recruitment exam questions. Use this whenever the user asks about specific concepts, theories, or requests similar questions. DO NOT use this for general greetings or simple conversation.',
    parameters: z.object({
        query: z.string().describe('The search keyword or question related to the exam knowledge'),
    }),
    execute: async ({ query }: { query: string }) => {
        console.log(`[RAG-Tool] Searching for: ${query}`);
        const context = await searchKnowledgeBase(query, 3);
        if (!context) {
            return "No relevant information found in the knowledge base. Please try to answer with your own general knowledge but explicitly state that 'no direct reference found in the database'.";
        }
        return `Found relevant context:\n${context}`;
    },
};

/**
 * 快捷指令类型
 */
export type CommandType = 'quiz' | 'explain' | 'none';

/**
 * 解析快捷指令
 * 支持：/quiz [关键词] 或 /explain [知识点]
 */
export function parseCommand(input: string): { type: CommandType; keyword: string } {
    const quizMatch = input.match(/^\/quiz\s+(.+)$/i);
    if (quizMatch) {
        return { type: 'quiz', keyword: quizMatch[1].trim() };
    }

    const explainMatch = input.match(/^\/explain\s+(.+)$/i);
    if (explainMatch) {
        return { type: 'explain', keyword: explainMatch[1].trim() };
    }

    return { type: 'none', keyword: '' };
}

/**
 * 基于用户消息检索相关题库内容 (混合检索 + 重排序)
 */
export async function searchKnowledgeBase(query: string, limit: number = 3) {
    try {
        // 1. 初始检索 (取稍多结果用于重排序)
        const fetchLimit = limit * 2;

        // 题库检索 (Keyword based)
        const questionResults = await searchSimilarContent(query, fetchLimit);

        // 知识卡片检索 (Vector based)
        const cardResults = await ragService.search(query, fetchLimit, 'card');

        // 教材内容检索 (Vector based)
        const textbookResults = await ragService.search(query, fetchLimit, 'textbook_chapter');

        if (questionResults.length === 0 && cardResults.length === 0 && textbookResults.length === 0) {
            return null;
        }

        // 2. 统一格式并准备重排序
        const allResults: RagResult[] = [
            ...questionResults.map(q => ({
                content: typeof q.content === 'string' ? q.content : JSON.stringify(q.content),
                score: 1, // 初始分数
                metadata: { ...q, source_type: 'question' }
            })),
            ...cardResults.map(c => ({
                ...c,
                metadata: { ...c.metadata, source_type: 'card' }
            })),
            ...textbookResults.map(t => ({
                ...t,
                metadata: { ...t.metadata, source_type: 'textbook' }
            }))
        ];

        // 3. 执行重排序 (如果配置了)
        const rerankedResults = await ragService.rerank(query, allResults);

        // 4. 取 Top N 并分门别类格式化
        const topResults = rerankedResults.slice(0, limit);

        const contextParts: string[] = [];
        const cardDocs = topResults.filter(r => r.metadata?.source_type === 'card');
        const questionDocs = topResults.filter(r => r.metadata?.source_type === 'question');
        const textbookDocs = topResults.filter(r => r.metadata?.source_type === 'textbook');

        // 格式化知识卡片
        if (cardDocs.length > 0) {
            const cardContext = cardDocs.map((item, index) => {
                const meta = item.metadata || {};
                return `
[知识卡片 ${index + 1}]
标题: ${meta.title || '无标题'}
内容: ${item.content}
标签: ${Array.isArray(meta.tags) ? meta.tags.join(', ') : '无'}
---`;
            }).join('\n');
            contextParts.push(`【相关知识卡片】\n${cardContext}`);
        }

        // 格式化教材内容
        if (textbookDocs.length > 0) {
            const tbContext = textbookDocs.map((item, index) => {
                const meta = item.metadata || {};
                return `
[教材章节 ${index + 1}]
章节: ${meta.title || '无标题'}
内容: ${item.content}
---`;
            }).join('\n');
            contextParts.push(`【相关教材内容】\n${tbContext}`);
        }

        // 格式化题库
        if (questionDocs.length > 0) {
            const questionContext = questionDocs.map((item: RagResult, index: number) => {
                const q = item.metadata || {};
                return `
[题目 ${index + 1}]
${item.content}
${q['explanation'] ? `解析: ${q['explanation']}` : ''}
标签: ${Array.isArray(q['tags']) ? (q['tags'] as string[]).join(', ') : String(q['tags'] || '无')}
---`;
            }).join('\n');
            contextParts.push(`【相关真题库】\n${questionContext}`);
        }

        return contextParts.join('\n\n');
    } catch (error) {
        console.error('[ChatRAG] 混合检索与重排序失败:', error);
        return null;
    }
}

/**
 * 构建增强型 System Prompt
 */
export function buildEnhancedSystemPrompt(context?: string, mode: 'standard' | 'socratic' = 'standard'): string {
    const standardPrompt = `你是一位资深的教师招聘考试辅导专家，擅长教育学、心理学和教学法。请用专业、友好的语气回答学生的问题，帮助他们理解概念和解决疑难。

特点：
- 回答简洁明了，重点突出
- 必要时提供例子帮助理解
- 如果涉及考点，指出考试中的常见陷阱
`;

    const basePrompt = mode === 'socratic'
        ? (getPromptFromDbSync('chat_system_socratic') || SOCRATIC_TUTOR_PROMPT)
        : (getPromptFromDbSync('chat_system') || standardPrompt);

    if (context) {
        return `${basePrompt}

【相关参考资料 (Reference Context)】
以下是系统提供的相关背景信息（可能来自题库、知识卡片或当前阅读的教材章节）：

${context}

请结合以上参考资料，为用户提供更准确和针对性的回答。`;
    }

    return basePrompt;
}

/**
 * 处理 /quiz 指令 - 生成相关练习题推荐
 */
export async function handleQuizCommand(keyword: string): Promise<string> {
    const results = await searchSimilarContent(keyword, 5);

    if (results.length === 0) {
        return `抱歉，我没有找到与"${keyword}"相关的题目。您可以尝试：
- 使用更通用的关键词
- 直接在练习页面开始随机练习，系统会根据您的掌握情况智能推题`;
    }

    let response = `📚 为您找到 ${results.length} 道关于"${keyword}"的相关题目：\n\n`;

    const ragResults: RagResult[] = results.map(q => ({
        content: typeof q.content === 'string' ? q.content : JSON.stringify(q.content),
        score: 1,
        metadata: { ...q }
    }));

    ragResults.forEach((item: RagResult, index: number) => {
        const content = item.content;
        const meta = item.metadata || {};
        response += `**${index + 1}. ${content.substring(0, 50)}...**\n`;
        response += `   - 难度层级: ${meta['dimension'] || '未标注'}\n`;
        response += `   - 知识点: ${Array.isArray(meta['tags']) ? (meta['tags'] as string[]).join(', ') : String(meta['tags'] || '未分类')}\n\n`;
    });

    response += `\n💡 建议：前往 [练习页面](/practice) 进行系统化训练，AI 会根据您的掌握度智能推荐题目。`;

    return response;
}

/**
 * 处理 /explain 指令 - 解释特定知识点
 */
export async function handleExplainCommand(keyword: string): Promise<string> {
    const context = await searchKnowledgeBase(keyword, 3);

    if (!context) {
        return `正在为您解释"${keyword}"的概念...`;
    }

    const prompt = `请详细解释"${keyword}"这个教育学/心理学概念。

要求：
1. 给出清晰的定义
2. 说明其在教育实践中的应用
3. 指出教师招聘考试中的常见考查方式
4. 提供1-2个具体例子

【题库参考】
${context}

请结合以上题目中涉及的知识点，给出专业且易懂的解释。`;

    try {
        const { text } = await generateTextWrapper(prompt, 'premium');
        return text;
    } catch (_error) {
        return `抱歉，生成解释时遇到错误。请稍后重试或直接提问。`;
    }
}
