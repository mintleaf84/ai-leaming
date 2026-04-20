'use server';
import logger from '@/lib/logger';

import { generateTextWrapper } from '@/lib/ai/client';
import { requireUser } from '@/lib/auth/auth';
import { getErrorMessage } from '@/lib/utils/error';

/**
 * 将 OCR 文本转化为结构化思维导图 Markdown
 */
export async function generateMindmapAction(ocrText: string): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
        await requireUser();

        // 构造 Prompt
        const prompt = `请作为结构化专家，将下方【OCR 识别得到的凌乱文本】重新整理并严格按照 Markdown 格式输出，以便使用 Markmap 渲染为思维导图。

要求：
1. 请不要输出任何额外的问候语或解释文字，直接输出 Markdown 内容本身。不要使用 \`\`\`markdown 代码块包裹内容。
2. 提炼出核心主题作为根节点，使用一个 \`#\`。
3. 梳理文本中的逻辑层级（一般有大小标题、要点），使用 \`##\`、\`###\` 表示分支节点。
4. 正文内容、具体要素或例证使用无序列表 \`-\` 作为叶子节点。
5. 必须保留文本中的所有关键信息和知识点，不要遗漏内容，特别要注意不要遗漏原图中的总结性内容和填空处（带有括号的部分）。
6. 如果存在表格或图片引用，可以简化为该表/图的标题。

这是 OCR 提取的原始文本：
"""
${ocrText}
"""
`;

        // 使用 economy 档次的小模型，速度快且便宜
        const { text } = await generateTextWrapper(
            prompt,
            'economy',
            undefined, // overrideKey
            undefined, // overrideUrl
            { timeout: 30000, retries: 1 }
        );

        // 清理可能的 markdown 代码块标记
        let cleanText = text.trim();
        if (cleanText.startsWith('```markdown')) {
            cleanText = cleanText.substring('```markdown'.length);
        } else if (cleanText.startsWith('```')) {
            cleanText = cleanText.substring('```'.length);
        }
        if (cleanText.endsWith('```')) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
        }
        
        cleanText = cleanText.trim();

        return { success: true, data: cleanText };

    } catch (error: unknown) {
        logger.error({ err: error }, '[Mindmap Action] 生成思维导图失败');
        return {
            success: false,
            error: getErrorMessage(error, '生成结构化思维导图失败')
        };
    }
}
