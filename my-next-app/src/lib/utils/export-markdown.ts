import { SessionDetail } from '@/server/actions/history';

/**
 * 将练习会话详情格式化为 Markdown 文本
 */
export function formatSessionToMarkdown(
    detail: SessionDetail,
    analysisReport?: string | null
): string {
    const lines: string[] = [];
    const { session, logs } = detail;

    // 格式化日期
    const date = new Date(session.createdAt);
    const dateStr = date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    // 标题
    lines.push(`# 练习记录 - ${dateStr}`);
    lines.push('');

    // 会话摘要
    lines.push('## 📊 练习概览');
    lines.push('');
    lines.push(`| 指标 | 数值 |`);
    lines.push(`| --- | --- |`);
    lines.push(`| 练习时间 | ${dateStr} |`);
    lines.push(`| 题目总数 | ${session.totalQuestions} 题 |`);
    lines.push(`| 正确数量 | ${session.correctCount} 题 |`);
    lines.push(`| 正确率 | ${session.accuracy}% |`);
    lines.push(`| 复盘题数 | ${session.reviewCount} 题 |`);
    lines.push('');

    // AI 分析报告（如果有）
    if (analysisReport) {
        lines.push('## 🤖 AI 深度分析');
        lines.push('');
        lines.push(analysisReport);
        lines.push('');
    }

    // 题目详情
    lines.push('## 📝 题目详情');
    lines.push('');

    logs.forEach((log, idx) => {
        const status = log.isCorrect ? '✅ 正确' : '❌ 错误';

        lines.push(`### 第 ${idx + 1} 题 ${status}`);
        lines.push('');

        // 题目内容
        lines.push('**题目内容**');
        lines.push('');
        lines.push(`> ${log.questionContent}`);
        lines.push('');

        // 选项
        if (log.options && log.options.length > 0) {
            lines.push('**选项**');
            lines.push('');
            log.options.forEach((opt, i) => {
                const letter = String.fromCharCode(65 + i); // A, B, C, D...
                const isUserAnswer = log.userAnswer === letter;
                const isCorrectAnswer = log.correctAnswer === letter;

                let marker = '';
                if (isUserAnswer && isCorrectAnswer) {
                    marker = ' ✅ (你的答案，正确)';
                } else if (isUserAnswer) {
                    marker = ' ❌ (你的答案)';
                } else if (isCorrectAnswer) {
                    marker = ' ✓ (正确答案)';
                }

                lines.push(`- **${letter}.** ${opt}${marker}`);
            });
            lines.push('');
        }

        // 答案对比
        lines.push('**答案**');
        lines.push('');
        lines.push(`- 你的答案：**${log.userAnswer || '未作答'}**`);
        lines.push(`- 正确答案：**${log.correctAnswer}**`);
        lines.push('');

        // 解析
        if (log.explanation) {
            lines.push('**解析**');
            lines.push('');
            lines.push(log.explanation);
            lines.push('');
        }

        // 考点
        if (log.tags && log.tags.length > 0) {
            lines.push('**考点标签**');
            lines.push('');
            lines.push(log.tags.map(t => `\`${t}\``).join(' '));
            lines.push('');
        }

        // AI 复盘内容
        if (log.reviewData) {
            lines.push('**AI 复盘**');
            lines.push('');
            if (typeof log.reviewData === 'string') {
                lines.push(log.reviewData);
            } else if (log.reviewData.review) {
                lines.push(log.reviewData.review);
            }
            lines.push('');
        }

        lines.push('---');
        lines.push('');
    });

    // 页脚
    lines.push(`*导出时间：${new Date().toLocaleString('zh-CN')}*`);

    return lines.join('\n');
}

/**
 * 生成导出文件名
 */
export function generateExportFilename(createdAt: string): string {
    const date = new Date(createdAt);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');

    return `练习记录_${y}-${m}-${d}_${h}-${min}.md`;
}
