'use server';

import { adminAction } from '@/lib/safe-action';
import { adminService } from '@/lib/services/admin-service';
import { z } from 'zod';
import type { ActivityFilters } from '@/types/activity';

/**
 * 获取用户练习活动流水线 (管理员权限)
 */
export const getUserActivityAction = adminAction
    .inputSchema(z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
        filters: z.object({
            userId: z.number().optional(),
            isCorrect: z.boolean().optional(),
            search: z.string().optional(),
        }).optional(),
    }))
    .action(async ({ parsedInput: input }) => {
        return await adminService.getActivityLogs(input.limit, input.offset, input.filters as ActivityFilters);
    });

/**
 * 获取活动统计概览 (管理员权限)
 */
export const getActivityStatsAction = adminAction
    .action(async () => {
        return await adminService.getActivityStats();
    });
