// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Mock 服务端模块（含 'use server' 指令和 db 依赖）
vi.mock('@/server/actions/history', () => ({}));

import { formatSessionToMarkdown, generateExportFilename } from '../export-markdown';

// 定义测试专用的会话详情类型（与 SessionDetail 结构保持一致）
type TestLogItem = {
    questionId: number;
    questionContent: string;
    options: string[];
    correctAnswer: string;
    userAnswer: string;
    isCorrect: boolean;
    duration: number;
    tags: string[];
    source: string;
    explanation: string;
    correctRatio: number | null;
    mostWrongAnswer: string | null;
    reviewData?: unknown;
};

type TestSessionDetail = {
    session: {
        id: string;
        totalQuestions: number;
        correctCount: number;
        reviewCount: number;
        createdAt: string;
        accuracy: number;
        practiceMode?: string;
    };
    logs: TestLogItem[];
};

// 构造测试用 SessionDetail 数据
const mockSessionDetail: TestSessionDetail = {
    session: {
        id: 'sess-001',
        totalQuestions: 3,
        correctCount: 2,
        reviewCount: 1,
        createdAt: '2024-06-15T08:00:00.000Z',
        accuracy: 67,
        practiceMode: 'standard',
    },
    logs: [
        {
            questionId: 1,
            questionContent: '以下哪项是正确的？',
            options: ['选项一', '选项二', '选项三'],
            correctAnswer: 'A',
            userAnswer: 'A',
            isCorrect: true,
            duration: 5000,
            tags: ['知识点A'],
            source: 'db',
            explanation: '选项一是正确的，因为……',
            correctRatio: 0.8,
            mostWrongAnswer: 'B',
        },
        {
            questionId: 2,
            questionContent: '下列说法错误的是？',
            options: ['甲说法', '乙说法'],
            correctAnswer: 'B',
            userAnswer: 'A',
            isCorrect: false,
            duration: 8000,
            tags: ['知识点B', '知识点C'],
            source: 'db',
            explanation: '乙说法是错误的。',
            correctRatio: null,
            mostWrongAnswer: null,
        },
    ],
};

describe('generateExportFilename（导出文件名生成）', () => {
    it('应生成格式正确的文件名', () => {
        const result = generateExportFilename('2024-06-15T10:30:00.000Z');
        expect(result).toMatch(/^练习记录_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.md$/);
    });

    it('文件名应包含年月日', () => {
        const result = generateExportFilename('2024-06-15T00:00:00.000Z');
        expect(result).toContain('2024');
        expect(result).toContain('06');
        expect(result).toContain('15');
    });

    it('文件名以 "练习记录_" 开头，以 ".md" 结尾', () => {
        const result = generateExportFilename('2024-01-01T12:00:00.000Z');
        expect(result.startsWith('练习记录_')).toBe(true);
        expect(result.endsWith('.md')).toBe(true);
    });

    it('不同时间戳应生成不同文件名', () => {
        const name1 = generateExportFilename('2024-01-01T00:00:00.000Z');
        const name2 = generateExportFilename('2024-06-15T12:30:00.000Z');
        expect(name1).not.toBe(name2);
    });
});

describe('formatSessionToMarkdown（会话 Markdown 格式化）', () => {
    it('应生成包含会话概览的 Markdown', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0]);
        expect(result).toContain('## 📊 练习概览');
        expect(result).toContain('题目总数');
        expect(result).toContain('3 题');
        expect(result).toContain('正确率');
    });

    it('应包含题目详情章节', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0]);
        expect(result).toContain('## 📝 题目详情');
        expect(result).toContain('第 1 题');
        expect(result).toContain('第 2 题');
    });

    it('答对的题目应标记 ✅', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0]);
        expect(result).toContain('✅ 正确');
    });

    it('答错的题目应标记 ❌', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0]);
        expect(result).toContain('❌ 错误');
    });

    it('应包含题目内容', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0]);
        expect(result).toContain('以下哪项是正确的');
        expect(result).toContain('下列说法错误的是');
    });

    it('应包含解析内容', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0]);
        expect(result).toContain('选项一是正确的');
    });

    it('标签应以代码块格式输出', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0]);
        expect(result).toContain('`知识点A`');
        expect(result).toContain('`知识点B`');
    });

    it('有 AI 分析报告时应包含分析章节', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0], '这是 AI 分析内容');
        expect(result).toContain('## 🤖 AI 深度分析');
        expect(result).toContain('这是 AI 分析内容');
    });

    it('无 AI 分析报告时不应包含分析章节', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0]);
        expect(result).not.toContain('## 🤖 AI 深度分析');
    });

    it('应包含导出时间页脚', () => {
        const result = formatSessionToMarkdown(mockSessionDetail as Parameters<typeof formatSessionToMarkdown>[0]);
        expect(result).toContain('导出时间');
    });
});
