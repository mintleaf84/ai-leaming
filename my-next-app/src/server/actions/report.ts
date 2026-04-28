'use server';

import logger from '@/lib/logger';
import { generateTextWrapper } from '@/lib/ai/client';
import { requireUser } from '@/lib/auth/auth';
import { reportService, type SessionReportData, type DeepAnalysisData } from '@/lib/services/report';


/**
 * 获取指定会话的报告数据
 */
export async function getSessionReportAction(sessionId?: string): Promise<SessionReportData | null> {
    try {
        const user = await requireUser();
        return await reportService.getSessionReportData(user.id, sessionId);
    } catch (error) {
        logger.error({ err: error }, '[ReportAction] 获取会话报告失败');
        return null;
    }
}

/**
 * 生成简易诊断报告 (AI)
 */
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
    } catch (error: unknown) {
        logger.error({ err: error }, "[ReportAction] 诊断报告生成失败");
        throw new Error("AI 诊断服务暂时不可用，请稍后再试。");
    }
}

/**
 * 获取已保存的深度分析报告
 */
export async function getAnalysisReportAction(sessionId: string): Promise<{ success: boolean; report?: string }> {
    try {
        const user = await requireUser();
        const report = await reportService.getSavedReport(user.id, sessionId);
        return { success: !!report, report: report || undefined };
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

        // 1. 检查缓存
        if (!forceRegenerate) {
            const existing = await reportService.getSavedReport(user.id, sessionId);
            if (existing) return { success: true, report: existing };
        }

        // 2. 获取深度分析所需的结构化数据
        const analysisData = await reportService.getDeepAnalysisData(user.id, sessionId);
        if (!analysisData) {
            return { success: false, error: '未找到该练习记录' };
        }

        // 3. 构建 Prompt (逻辑保留自原 Action)
        const tagTableRows = analysisData.tagStats.slice(0, 10).map(t =>
            `| ${t.tag} | ${t.total} | ${t.correct} | ${t.accuracy}% |`
        ).join('\n');

        const repeatedErrorsList = analysisData.repeatedErrors.length > 0
            ? analysisData.repeatedErrors.map(e => `- **${e.tag}**：出错 ${e.errorCount} 次`).join('\n')
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

        // 4. 调用 AI
        const { text } = await generateTextWrapper(prompt, 'economy');

        // 5. 持久化报告
        await reportService.saveReport(user.id, sessionId, text);

        return { success: true, report: text };
    } catch (error: unknown) {
        logger.error({ err: error }, '[ReportAction] 深度分析失败');
        return { success: false, error: 'AI 分析服务暂时不可用，请稍后再试。' };
    }
}
