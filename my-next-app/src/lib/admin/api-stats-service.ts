/**
 * API 调用统计服务
 * 记录和统计 AI API 的调用情况
 */

import { drizzleDb, drizzleSchema } from '../db';
import { eq, and, sql, desc } from 'drizzle-orm';
import { getBeijingDateString } from '../utils/datetime';

const { api_call_logs } = drizzleSchema;

export interface ApiCallLog {
  id: number;
  user_id: number | null;
  config_id: number | null;
  model: string;
  endpoint: string | null;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number | null;
  success: number;
  error_message: string | null;
  created_at: string;
}

/**
 * 模型的定价信息 (每百万 Token 的价格，单位：人民币元)
 */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'deepseek-ai/deepseek-v3.2': { input: 2.0, output: 3.0 },
  'deepseek-ai/DeepSeek-V3.2': { input: 2.0, output: 3.0 },
  'DeepSeek-R1': { input: 2.0, output: 3.0 },
  'deepseek-chat': { input: 2.0, output: 3.0 },
  'gpt-4o-mini': { input: 1.0, output: 4.3 },
  'gpt-4o': { input: 36.0, output: 108.0 },
};

export interface ApiCallStats {
  today: {
    totalCalls: number;
    successCalls: number;
    errorCalls: number;
    totalTokens: number;
    totalCost: number; // 今日预估成本
  };
  total: {
    totalCalls: number;
    successCalls: number;
    errorCalls: number;
    totalTokens: number;
    totalCost: number; // 累计预估成本
  };
  byModel: { model: string; calls: number; tokens: number; cost: number }[];
  recentErrors: { model: string; error: string; time: string }[];
}

/**
 * 记录 API 调用
 */
export async function logApiCall(params: {
  userId?: number | null;
  configId?: number | null;
  model: string;
  endpoint?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    await drizzleDb.insert(api_call_logs).values({
      user_id: params.userId ?? null,
      config_id: params.configId ?? null,
      model: params.model,
      endpoint: params.endpoint ?? null,
      input_tokens: params.inputTokens ?? 0,
      output_tokens: params.outputTokens ?? 0,
      duration_ms: params.durationMs ?? null,
      success: params.success !== false ? 1 : 0,
      error_message: params.errorMessage ?? null
    });
  } catch (error) {
    console.error('Failed to log API call:', error);
  }
}

/**
 * 计算 API 调用成本 (人民币元)
 */
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // 尝试直接匹配或不区分大小写匹配
  const pricing = MODEL_PRICES[model] ||
    Object.entries(MODEL_PRICES).find(([key]) => key.toLowerCase() === model.toLowerCase())?.[1];

  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
}

/**
 * 获取 API 调用统计（SQL 聚合，避免全量加载到内存）
 */
export async function getApiCallStats(): Promise<ApiCallStats> {
  const todayStr = getBeijingDateString();

  // 1. 按模型聚合（全量 + 今日条件聚合在一次查询中完成）
  const modelRows = await drizzleDb.select({
    model: api_call_logs.model,
    totalCalls: sql<number>`count(*)`,
    totalSuccessCalls: sql<number>`sum(case when ${api_call_logs.success} = 1 then 1 else 0 end)`,
    totalInputTokens: sql<number>`coalesce(sum(case when ${api_call_logs.success} = 1 then ${api_call_logs.input_tokens} else 0 end), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(case when ${api_call_logs.success} = 1 then ${api_call_logs.output_tokens} else 0 end), 0)`,
    todayCalls: sql<number>`sum(case when cast(${api_call_logs.created_at} as text) like ${todayStr + '%'} then 1 else 0 end)`,
    todaySuccessCalls: sql<number>`sum(case when cast(${api_call_logs.created_at} as text) like ${todayStr + '%'} and ${api_call_logs.success} = 1 then 1 else 0 end)`,
    todayInputTokens: sql<number>`coalesce(sum(case when cast(${api_call_logs.created_at} as text) like ${todayStr + '%'} and ${api_call_logs.success} = 1 then ${api_call_logs.input_tokens} else 0 end), 0)`,
    todayOutputTokens: sql<number>`coalesce(sum(case when cast(${api_call_logs.created_at} as text) like ${todayStr + '%'} and ${api_call_logs.success} = 1 then ${api_call_logs.output_tokens} else 0 end), 0)`,
  })
    .from(api_call_logs)
    .groupBy(api_call_logs.model);

  // 2. 全局汇总（今日 + 总量，一次查询）
  const summaryRow = await drizzleDb.select({
    totalCalls: sql<number>`count(*)`,
    totalSuccessCalls: sql<number>`sum(case when ${api_call_logs.success} = 1 then 1 else 0 end)`,
    totalErrorCalls: sql<number>`sum(case when ${api_call_logs.success} = 0 then 1 else 0 end)`,
    todayCalls: sql<number>`sum(case when cast(${api_call_logs.created_at} as text) like ${todayStr + '%'} then 1 else 0 end)`,
    todaySuccessCalls: sql<number>`sum(case when cast(${api_call_logs.created_at} as text) like ${todayStr + '%'} and ${api_call_logs.success} = 1 then 1 else 0 end)`,
    todayErrorCalls: sql<number>`sum(case when cast(${api_call_logs.created_at} as text) like ${todayStr + '%'} and ${api_call_logs.success} = 0 then 1 else 0 end)`,
    todayInputTokens: sql<number>`coalesce(sum(case when cast(${api_call_logs.created_at} as text) like ${todayStr + '%'} and ${api_call_logs.success} = 1 then ${api_call_logs.input_tokens} else 0 end), 0)`,
    todayOutputTokens: sql<number>`coalesce(sum(case when cast(${api_call_logs.created_at} as text) like ${todayStr + '%'} and ${api_call_logs.success} = 1 then ${api_call_logs.output_tokens} else 0 end), 0)`,
    totalInputTokens: sql<number>`coalesce(sum(case when ${api_call_logs.success} = 1 then ${api_call_logs.input_tokens} else 0 end), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(case when ${api_call_logs.success} = 1 then ${api_call_logs.output_tokens} else 0 end), 0)`,
  })
    .from(api_call_logs);

  // 3. 最近错误
  const errorRows = await drizzleDb.select({
    model: api_call_logs.model,
    error: api_call_logs.error_message,
    time: api_call_logs.created_at
  })
    .from(api_call_logs)
    .where(and(eq(api_call_logs.success, 0), sql`${api_call_logs.error_message} IS NOT NULL`))
    .orderBy(desc(api_call_logs.created_at))
    .limit(5);

  // JS 侧：对聚合后的模型行（通常 <10 行）计算成本
  const byModel = modelRows
    .map(m => ({
      model: m.model,
      calls: m.totalSuccessCalls,
      tokens: m.totalInputTokens + m.totalOutputTokens,
      cost: calculateCost(m.model, m.totalInputTokens, m.totalOutputTokens),
    }))
    .sort((a, b) => b.calls - a.calls);

  const todayCost = modelRows.reduce((sum, m) =>
    sum + calculateCost(m.model, m.todayInputTokens, m.todayOutputTokens), 0);

  const totalCost = byModel.reduce((sum, m) => sum + m.cost, 0);
  const summary = summaryRow[0];

  return {
    today: {
      totalCalls: summary.todayCalls,
      successCalls: summary.todaySuccessCalls,
      errorCalls: summary.todayErrorCalls,
      totalTokens: summary.todayInputTokens + summary.todayOutputTokens,
      totalCost: todayCost,
    },
    total: {
      totalCalls: summary.totalCalls,
      successCalls: summary.totalSuccessCalls,
      errorCalls: summary.totalErrorCalls,
      totalTokens: summary.totalInputTokens + summary.totalOutputTokens,
      totalCost,
    },
    byModel,
    recentErrors: errorRows.map(row => ({
      model: row.model,
      error: row.error || '',
      time: row.time || ''
    })),
  };
}

/**
 * 格式化 Token 数量
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(2) + 'M';
  }
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toString();
}
