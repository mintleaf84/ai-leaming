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
 * 获取 API 调用统计
 */
export async function getApiCallStats(): Promise<ApiCallStats> {
  interface LogRow {
    model: string;
    input_tokens: number | null;
    output_tokens: number | null;
    success: number | null;
    created_at: string | null;
  }

  // 基础查询：获取所有调用记录 (优化建议：如果数据量大，应该使用聚合查询)
  const logs = await drizzleDb.select({
    model: api_call_logs.model,
    input_tokens: api_call_logs.input_tokens,
    output_tokens: api_call_logs.output_tokens,
    success: api_call_logs.success,
    created_at: api_call_logs.created_at
  }).from(api_call_logs) as LogRow[];

  // 今日起始时间 (使用北京时间)
  const todayStr = getBeijingDateString();

  const stats: ApiCallStats = {
    today: { totalCalls: 0, successCalls: 0, errorCalls: 0, totalTokens: 0, totalCost: 0 },
    total: { totalCalls: 0, successCalls: 0, errorCalls: 0, totalTokens: 0, totalCost: 0 },
    byModel: [],
    recentErrors: []
  };

  const modelMap = new Map<string, { calls: number; tokens: number; cost: number }>();

  logs.forEach(log => {
    const isToday = log.created_at?.startsWith(todayStr);
    const tokens = (log.input_tokens || 0) + (log.output_tokens || 0);
    const cost = calculateCost(log.model, log.input_tokens || 0, log.output_tokens || 0);

    // 更新总计
    stats.total.totalCalls++;
    if (log.success) {
      stats.total.successCalls++;
      stats.total.totalTokens += tokens;
      stats.total.totalCost += cost;
    } else {
      stats.total.errorCalls++;
    }

    // 更新今日
    if (isToday) {
      stats.today.totalCalls++;
      if (log.success) {
        stats.today.successCalls++;
        stats.today.totalTokens += tokens;
        stats.today.totalCost += cost;
      } else {
        stats.today.errorCalls++;
      }
    }

    // 更新按模型统计
    if (log.success) {
      const m = modelMap.get(log.model) || { calls: 0, tokens: 0, cost: 0 };
      m.calls++;
      m.tokens += tokens;
      m.cost += cost;
      modelMap.set(log.model, m);
    }
  });

  stats.byModel = Array.from(modelMap.entries()).map(([model, data]) => ({
    model,
    ...data
  })).sort((a, b) => b.calls - a.calls);

  // 获取最近错误 (维护数据库查询，减少全量处理错误信息的负担)
  const errorRows = await drizzleDb.select({
    model: api_call_logs.model,
    error: api_call_logs.error_message,
    time: api_call_logs.created_at
  })
  .from(api_call_logs)
  .where(and(eq(api_call_logs.success, 0), sql`${api_call_logs.error_message} IS NOT NULL`))
  .orderBy(desc(api_call_logs.created_at))
  .limit(5);

  stats.recentErrors = errorRows.map(row => ({
    model: row.model,
    error: row.error || '',
    time: row.time || ''
  }));

  return stats;
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
