'use server';

import { getHealthStats, HealthStats } from '@/lib/health-service';
import { requireRole } from '@/lib/auth';

/**
 * 获取系统健康统计信息（仅限管理员）
 */
export async function getHealthStatsAction(): Promise<HealthStats> {
    await requireRole(['admin']);
    return getHealthStats();
}
