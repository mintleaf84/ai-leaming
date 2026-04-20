import { ragService } from '@/lib/ai/rag';

const CONFIDENCE_THRESHOLD = 0.6; // Threshold for RAG results

export const contentEngine = {
  /**
   * Fetch content with Honest Blank Strategy
   */
  getContentForTag: async (tagName: string): Promise<{ content: string; isBlank: boolean }> => {
    try {
      const results = await ragService.search(tagName, 1);
      
      if (results.length === 0 || results[0].score < CONFIDENCE_THRESHOLD) {
        return {
          content: "该知识点较为生僻，AI 暂时无法从库内提取权威解析。建议查阅最新的《教育综合知识》教材原文。我们将持续优化内容库。",
          isBlank: true
        };
      }
      
      return {
        content: results[0].content,
        isBlank: false
      };
    } catch (error) {
      console.error('Content engine failed:', error);
      return {
        content: "系统繁忙，无法获取解析。",
        isBlank: true
      };
    }
  }
};
