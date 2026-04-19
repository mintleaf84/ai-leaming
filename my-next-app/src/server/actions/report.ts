'use server';
import logger from '@/lib/logger';

import { generateTextWrapper } from '@/lib/ai/client';
import db from '@/lib/db';
import { requireUser } from '@/lib/auth/auth';

// 会话报告数据类型
export interface SessionReportData {
  totalQuestions: number;
  correctCount: number;
  errorTags: string[];
  avgDuration: number;
  dimensionStats: { axis: string; value: number }[];
  accuracy: number;
}

/**
 * 获取指定会话的报告数据
 * 如果不传 sessionId，则返回用户最近一次会话的数据
 */
export async function getSessionReportAction(sessionId?: string): Promise<SessionReportData | null> {
  try {
    const user = await requireUser();

    // 如果没有传 sessionId，获取最近一次会话
    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const lastSession = db.prepare(`
        SELECT id FROM practice_sessions 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(user.id) as { id: string } | undefined;

      if (!lastSession) return null;
      targetSessionId = lastSession.id;
    }

    // 1. 获取会话基础统计
    const sessionStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
        AVG(duration_ms) as avg_duration
      FROM practice_logs 
      WHERE session_id = ? AND user_id = ?
    `).get(targetSessionId, user.id) as { total: number; correct: number; avg_duration: number } | undefined;

    if (!sessionStats || sessionStats.total === 0) {
      return null;
    }

    // 2. 获取错题知识点
    const errorTags = db.prepare(`
      SELECT DISTINCT je.value as tag
      FROM practice_logs pl
      JOIN questions q ON q.id = pl.question_id
      JOIN json_each(q.tags) je
      WHERE pl.session_id = ? AND pl.user_id = ? AND pl.is_correct = 0
    `).all(targetSessionId, user.id) as { tag: string }[];

    // 3. 按维度统计正确率
    const dimensionRaw = db.prepare(`
      SELECT 
        q.dimension,
        COUNT(*) as total,
        SUM(CASE WHEN pl.is_correct = 1 THEN 1 ELSE 0 END) as correct
      FROM practice_logs pl
      JOIN questions q ON q.id = pl.question_id
      WHERE pl.session_id = ? AND pl.user_id = ?
      GROUP BY q.dimension
    `).all(targetSessionId, user.id) as { dimension: string; total: number; correct: number }[];

    // 维度中文映射
    const dimensionLabels: Record<string, string> = {
      knowledge: '识记',
      understanding: '理解',
      application: '应用'
    };

    // 构建维度统计，确保三个维度都有值
    const dimensionMap = new Map(dimensionRaw.map(d => [
      d.dimension,
      Math.round((d.correct / d.total) * 100)
    ]));

    const dimensionStats = [
      { axis: '识记', value: dimensionMap.get('knowledge') ?? 0 },
      { axis: '理解', value: dimensionMap.get('understanding') ?? 0 },
      { axis: '应用', value: dimensionMap.get('application') ?? 0 }
    ];

    return {
      totalQuestions: sessionStats.total,
      correctCount: sessionStats.correct,
      errorTags: errorTags.map(t => t.tag),
      avgDuration: Math.round(sessionStats.avg_duration || 0),
      dimensionStats,
      accuracy: Math.round((sessionStats.correct / sessionStats.total) * 100)
    };
  } catch (error) {
    logger.error('获取会话报告数据失败:', error);
    return null;
  }
}

export async function generateDiagnosticReportAction(
  sessionSummary: {
    totalQuestions: number;
    correctCount: number;
    errorTags: string[];
    avgDuration: number;
  }
): Promise<string> {
  const prompt = `
    请为用户生成一份本次练习的“AI 诊断性叙述报告”。
    
    练习数据:
    - 总题数: ${sessionSummary.totalQuestions}
    - 正确数: ${sessionSummary.correctCount}
    - 错误考点: ${sessionSummary.errorTags.join(', ')}
    - 平均耗时: ${sessionSummary.avgDuration}ms
    
    请包含以下内容：
    1. 总体表现点评（严肃、客观）。
    2. 核心病灶定位（指出最薄弱的环节）。
    3. 次日复习建议（具体到知识点）。
    
    请用Markdown格式输出，字数控制在200字以内。
  `;

  try {
    const { text } = await generateTextWrapper(prompt, 'economy');
    return text;
  } catch (error) {
    logger.error("Diagnostic Report Generation Error:", error);
    // Return a structured error message that the UI can handle
    throw new Error("AI 诊断服务暂时不可用，请稍后再试或联系技术支持。");
  }
}

/**
 * 深度分析数据类型
 */
export interface DeepAnalysisData {
  // 基础统计
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  avgDuration: number;

  // 知识点统计
  tagStats: Array<{
    tag: string;
    total: number;
    correct: number;
    accuracy: number;
  }>;

  // 重复错误模式
  repeatedErrors: Array<{
    tag: string;
    errorCount: number;
  }>;

  // 维度统计
  dimensionStats: {
    knowledge: number;
    understanding: number;
    application: number;
  };
}

/**
 * 获取已保存的分析报告
 */
export async function getAnalysisReportAction(sessionId: string): Promise<{ success: boolean; report?: string }> {
  try {
    const user = await requireUser();
    const row = db.prepare(`
      SELECT analysis_report FROM practice_sessions 
      WHERE id = ? AND user_id = ?
    `).get(sessionId, user.id) as { analysis_report: string | null } | undefined;

    if (row?.analysis_report) {
      return { success: true, report: row.analysis_report };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

/**
 * 生成 AI 深度分析报告
 */
export async function generateDeepAnalysisAction(sessionId: string, forceRegenerate = false): Promise<{ success: boolean; report?: string; error?: string }> {
  try {
    const user = await requireUser();

    // 检查是否已有保存的报告（除非强制重新生成）
    if (!forceRegenerate) {
      const existing = await getAnalysisReportAction(sessionId);
      if (existing.success && existing.report) {
        return existing;
      }
    }

    // 1. 获取基础统计
    const sessionStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
        AVG(duration_ms) as avg_duration
      FROM practice_logs 
      WHERE session_id = ? AND user_id = ?
    `).get(sessionId, user.id) as { total: number; correct: number; avg_duration: number } | undefined;

    if (!sessionStats || sessionStats.total === 0) {
      return { success: false, error: '未找到该练习记录' };
    }

    // 2. 知识点统计（按 tag 分组）
    const tagStatsRaw = db.prepare(`
      SELECT 
        je.value as tag,
        COUNT(*) as total,
        SUM(CASE WHEN pl.is_correct = 1 THEN 1 ELSE 0 END) as correct
      FROM practice_logs pl
      JOIN questions q ON q.id = pl.question_id
      JOIN json_each(q.tags) je
      WHERE pl.session_id = ? AND pl.user_id = ?
      GROUP BY je.value
      ORDER BY total DESC
    `).all(sessionId, user.id) as { tag: string; total: number; correct: number }[];

    const tagStats = tagStatsRaw.map(t => ({
      tag: t.tag,
      total: t.total,
      correct: t.correct,
      accuracy: Math.round((t.correct / t.total) * 100)
    }));

    // 3. 识别重复错误模式（同一知识点出错 2 次及以上）
    const repeatedErrors = tagStats
      .filter(t => (t.total - t.correct) >= 2)
      .map(t => ({
        tag: t.tag,
        errorCount: t.total - t.correct
      }))
      .sort((a, b) => b.errorCount - a.errorCount);

    // 4. 维度统计
    const dimensionRaw = db.prepare(`
      SELECT 
        q.dimension,
        COUNT(*) as total,
        SUM(CASE WHEN pl.is_correct = 1 THEN 1 ELSE 0 END) as correct
      FROM practice_logs pl
      JOIN questions q ON q.id = pl.question_id
      WHERE pl.session_id = ? AND pl.user_id = ?
      GROUP BY q.dimension
    `).all(sessionId, user.id) as { dimension: string; total: number; correct: number }[];

    const dimensionMap = new Map(dimensionRaw.map(d => [
      d.dimension,
      d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0
    ]));

    // 5. 构建数据对象
    const analysisData: DeepAnalysisData = {
      totalQuestions: sessionStats.total,
      correctCount: sessionStats.correct,
      accuracy: Math.round((sessionStats.correct / sessionStats.total) * 100),
      avgDuration: Math.round(sessionStats.avg_duration || 0),
      tagStats,
      repeatedErrors,
      dimensionStats: {
        knowledge: dimensionMap.get('knowledge') ?? 0,
        understanding: dimensionMap.get('understanding') ?? 0,
        application: dimensionMap.get('application') ?? 0
      }
    };

    // 6. 构建 AI Prompt
    const tagTableRows = tagStats.slice(0, 10).map(t =>
      `| ${t.tag} | ${t.total} | ${t.correct} | ${t.accuracy}% |`
    ).join('\n');

    const repeatedErrorsList = repeatedErrors.length > 0
      ? repeatedErrors.map(e => `- **${e.tag}**：出错 ${e.errorCount} 次`).join('\n')
      : '无明显重复错误模式';

    const prompt = `你是一位资深的教育诊断专家。请根据以下学生的练习数据，生成一份深度分析报告。

## 练习数据
- 总题数：${analysisData.totalQuestions}
- 正确数：${analysisData.correctCount}
- 正确率：${analysisData.accuracy}%
- 平均答题时间：${Math.round(analysisData.avgDuration / 1000)}秒

## 知识点表现
| 知识点 | 题数 | 正确 | 正确率 |
|--------|------|------|--------|
${tagTableRows}

## 重复错误模式
${repeatedErrorsList}

## 维度表现
- 识记：${analysisData.dimensionStats.knowledge}%
- 理解：${analysisData.dimensionStats.understanding}%
- 应用：${analysisData.dimensionStats.application}%

---

请生成分析报告，必须包含以下 4 个部分：
1. **整体诊断**：一句话概括本次练习的表现
2. **知识点雷达**：指出最强和最弱的 2-3 个知识点，用表情符号标注（✅ 强项，⚠️ 弱项）
3. **错误模式**：分析是否存在反复出错的模式及可能原因
4. **针对性建议**：给出具体的复习建议，包括优先级排序

格式要求：使用 Markdown，简洁专业，约 300 字。`;

    // 7. 调用 AI 生成报告
    const { text } = await generateTextWrapper(prompt, 'economy');

    // 8. 保存报告到数据库
    db.prepare(`
      UPDATE practice_sessions SET analysis_report = ? WHERE id = ? AND user_id = ?
    `).run(text, sessionId, user.id);

    return { success: true, report: text };
  } catch (error) {
    logger.error('AI 深度分析失败:', error);
    return { success: false, error: 'AI 分析服务暂时不可用，请稍后再试。' };
  }
}
