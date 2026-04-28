'use server';

import { authenticatedAction } from '@/lib/safe-action';
import { knowledgeService } from '@/lib/services/knowledge';

/**
 * 获取知识图谱数据
 */
export const getKnowledgeGraphData = authenticatedAction
  .action(async ({ ctx }) => {
    const { user } = ctx;
    return await knowledgeService.getKnowledgeGraphData(user.id);
  });
