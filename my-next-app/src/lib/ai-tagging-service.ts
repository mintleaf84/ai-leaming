import { generateStructuredData } from './ai-client';
import { z } from 'zod';

const TaggingResultSchema = z.object({
  tags: z.array(z.string()),
  dimension: z.enum(['knowledge', 'understanding', 'application'])
});

export interface TaggingResult {
  tags: string[];
  dimension: 'knowledge' | 'understanding' | 'application';
}

export const aiTaggingService = {
  /**
   * Use AI to tag a question with knowledge points and cognitive dimension.
   */
  tagQuestion: async (questionContent: string): Promise<TaggingResult> => {
    const prompt = `
      你是一个专业的教师招聘考试专家。请对以下题目进行打标。
      你需要输出：
      1. 知识点标签 (tags): 具体的考点名称，如 ["皮亚杰认知发展阶段", "教育法律法规"]。
      2. 认知维度 (dimension): 必须是 "knowledge" (识记), "understanding" (理解), 或 "application" (应用) 之一。

      题目内容：
      ${questionContent}

      请仅输出 JSON 格式，如下：
      {
        "tags": ["标签1", "标签2"],
        "dimension": "understanding"
      }
    `;

    try {
      return await generateStructuredData(TaggingResultSchema, prompt, 'economy');
    } catch (error) {
      console.error('AI Tagging failed:', error);
      return { tags: ['未知考点'], dimension: 'knowledge' };
    }
  }
};
