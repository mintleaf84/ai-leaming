"use server";

import { authenticatedAction } from "@/lib/safe-action";
import { statsService } from "@/lib/services/stats";
import { z } from "zod";

/**
 * 获取用户首页仪表盘统计数据
 */
export const getUserStatsAction = authenticatedAction.action(
  async ({ ctx }) => {
    const { user } = ctx;
    const data = await statsService.getUserStats(user.id);
    return { success: true, ...data };
  },
);

/**
 * 获取练习趋势数据 (近 N 天)
 */
export const getPracticeTrendAction = authenticatedAction
  .inputSchema(z.number().default(14))
  .action(async ({ parsedInput: days, ctx }) => {
    const { user } = ctx;
    return await statsService.getPracticeTrend(user.id, days);
  });
