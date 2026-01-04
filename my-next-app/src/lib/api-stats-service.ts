/**
 * API 调用统计服务
 * 记录和统计 AI API 的调用情况
 */

import db from './db';

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
export function logApiCall(params: {
  userId?: number | null;
  configId?: number | null;
  model: string;
  endpoint?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
}): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO api_call_logs 
        (user_id, config_id, model, endpoint, input_tokens, output_tokens, duration_ms, success, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      params.userId ?? null,
      params.configId ?? null,
      params.model,
      params.endpoint ?? null,
      params.inputTokens ?? 0,
      params.outputTokens ?? 0,
      params.durationMs ?? null,
      params.success !== false ? 1 : 0,
      params.errorMessage ?? null
    );
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
export function getApiCallStats(): ApiCallStats {
  // 基础查询：获取所有成功的调用记录
  const logs = db.prepare(`
    SELECT model, input_tokens, output_tokens, success, created_at
    FROM api_call_logs
  `).all() as any[];

  // 今日起始时间
  const todayStr = new Date().toISOString().split('T')[0];

  const stats: ApiCallStats = {
    today: { totalCalls: 0, successCalls: 0, errorCalls: 0, totalTokens: 0, totalCost: 0 },
    total: { totalCalls: 0, successCalls: 0, errorCalls: 0, totalTokens: 0, totalCost: 0 },
    byModel: [],
    recentErrors: []
  };

  const modelMap = new Map<string, { calls: number; tokens: number; cost: number }>();

  logs.forEach(log => {
    const isToday = log.created_at.startsWith(todayStr);
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

  // 获取最近错误 (维持数据库查询，减少全量处理错误信息的负担)
  stats.recentErrors = db.prepare(`
    SELECT model, error_message as error, created_at as time
    FROM api_call_logs
    WHERE success = 0 AND error_message IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5
  `).all() as any[];

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
