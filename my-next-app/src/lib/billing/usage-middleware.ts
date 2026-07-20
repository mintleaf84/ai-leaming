/**
 * 用量拦截中间件
 * 在 AI 调用前检查配额，超限时返回友好提示
 */

import { checkAndConsumeQuota, checkUsageQuota } from "./subscription-service";
import {
  UsageType,
  UsageCheckResult,
  USAGE_TYPE_LABELS,
} from "@/types/subscription";

/**
 * 检查用量配额 (不消费)
 * @param userId 用户 ID
 * @param usageType 用量类型
 * @returns 检查结果
 */
export async function checkQuota(
  userId: number,
  usageType: UsageType,
): Promise<UsageCheckResult> {
  return await checkUsageQuota(userId, usageType);
}

/**
 * 检查并消费配额
 * @param userId 用户 ID
 * @param usageType 用量类型
 * @returns 检查结果，如果允许则已自动消费 1 次配额
 */
export async function consumeQuota(
  userId: number,
  usageType: UsageType,
): Promise<UsageCheckResult> {
  return await checkAndConsumeQuota(userId, usageType);
}

/**
 * 创建用量限制错误响应
 * @param usageType 用量类型
 * @param result 检查结果
 */
export function createQuotaExceededResponse(
  usageType: UsageType,
  result: UsageCheckResult,
) {
  const label = USAGE_TYPE_LABELS[usageType];
  return {
    error: "QUOTA_EXCEEDED",
    message: result.message || `今日${label}次数已用完，请升级套餐解锁更多`,
    current: result.current,
    limit: result.limit,
    usageType,
    upgradeUrl: "/pricing",
  };
}

/**
 * 包装函数：带用量检查的异步操作
 * @param userId 用户 ID
 * @param usageType 用量类型
 * @param operation 要执行的操作
 * @returns 操作结果或用量超限错误
 */
export async function withQuotaCheck<T>(
  userId: number,
  usageType: UsageType,
  operation: () => Promise<T>,
): Promise<T | ReturnType<typeof createQuotaExceededResponse>> {
  const result = await consumeQuota(userId, usageType);

  if (!result.allowed) {
    return createQuotaExceededResponse(usageType, result);
  }

  return await operation();
}

/**
 * 用于 API Route 的中间件辅助函数
 * 返回 null 表示可以继续，否则返回错误响应
 */
export async function checkQuotaForApi(
  userId: number,
  usageType: UsageType,
): Promise<{ error: ReturnType<typeof createQuotaExceededResponse> } | null> {
  const result = await consumeQuota(userId, usageType);

  if (!result.allowed) {
    return { error: createQuotaExceededResponse(usageType, result) };
  }

  return null;
}
