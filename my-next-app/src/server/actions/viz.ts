'use server';

import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth/auth';
import { knowledgeService } from '@/lib/services/knowledge';

export interface KnowledgeNode {
  id: string;
  group: number;
  score: number;
}

export interface KnowledgeLink {
  source: string;
  target: string;
  value: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
}

/**
 * 获取知识图谱数据
 */
export async function getKnowledgeGraphData(): Promise<KnowledgeGraphData> {
  try {
    const user = await requireUser();
    return await knowledgeService.getKnowledgeGraphData(user.id);
  } catch (error) {
    logger.error({ err: error }, '[VizAction] 获取知识图谱数据失败');
    return { nodes: [], links: [] };
  }
}
