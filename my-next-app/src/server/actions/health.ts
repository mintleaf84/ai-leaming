"use server";

import { getHealthStats, HealthStats } from "@/lib/admin/health";
import { requireRole } from "@/lib/auth/auth";

/**
 * 获取系统健康统计信息（仅限管理员）
 */
export async function getHealthStatsAction(): Promise<HealthStats> {
  await requireRole(["admin"]);
  return await getHealthStats();
}
