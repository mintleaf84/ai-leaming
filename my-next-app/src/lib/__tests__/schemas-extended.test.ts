import { describe, it, expect } from 'vitest';
import {
    PracticeSessionRowSchema,
    PracticeLogRowSchema,
    QuestionRowSchema,
    CorrectionQuizSchema,
    RegressionChallengeSchema,
} from '../schemas';

// ---- PracticeSessionRowSchema ----

describe('PracticeSessionRowSchema（练习会话行验证）', () => {
    const baseSession = {
        id: 'sess-abc-123',
        user_id: 1,
        total_questions: 10,
        correct_count: 8,
        review_count: 2,
        questions_json: JSON.stringify([{ id: 1 }, { id: 2 }]),
    };

    it('合法数据应通过验证', () => {
        expect(PracticeSessionRowSchema.safeParse(baseSession).success).toBe(true);
    });

    it('questions_json 应自动解析为数组', () => {
        const result = PracticeSessionRowSchema.safeParse(baseSession);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(Array.isArray(result.data.questions_json)).toBe(true);
            expect(result.data.questions_json).toHaveLength(2);
        }
    });

    it('空 questions_json 应解析为空数组', () => {
        const data = { ...baseSession, questions_json: '' };
        const result = PracticeSessionRowSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.questions_json).toEqual([]);
        }
    });

    it('无效 JSON 的 questions_json 应触发验证错误', () => {
        const data = { ...baseSession, questions_json: 'not-valid-json' };
        const result = PracticeSessionRowSchema.safeParse(data);
        // Zod 在 transform 中调用 ctx.addIssue 后标记为失败
        expect(result.success).toBe(false);
    });

    it('session_name 可为 null', () => {
        const data = { ...baseSession, session_name: null };
        expect(PracticeSessionRowSchema.safeParse(data).success).toBe(true);
    });

    it('缺少 id 字段应验证失败', () => {
        const { id: _, ...noId } = baseSession;
        expect(PracticeSessionRowSchema.safeParse(noId).success).toBe(false);
    });

    it('correct_count 缺省时应默认为 0', () => {
        const { correct_count: _, ...noCount } = baseSession;
        const result = PracticeSessionRowSchema.safeParse(noCount);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.correct_count).toBe(0);
        }
    });
});

// ---- PracticeLogRowSchema ----

describe('PracticeLogRowSchema（练习日志行验证）', () => {
    const baseLog = {
        id: 1,
        session_id: 'sess-001',
        user_id: 1,
        question_id: 42,
        user_answer: 'A',
        is_correct: 1,
        duration_ms: 3000,
    };

    it('合法数据应通过验证', () => {
        expect(PracticeLogRowSchema.safeParse(baseLog).success).toBe(true);
    });

    it('is_correct 为 1 时应转换为 true', () => {
        const result = PracticeLogRowSchema.safeParse({ ...baseLog, is_correct: 1 });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.is_correct).toBe(true);
        }
    });

    it('is_correct 为 0 时应转换为 false', () => {
        const result = PracticeLogRowSchema.safeParse({ ...baseLog, is_correct: 0 });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.is_correct).toBe(false);
        }
    });

    it('session_id 可为 null', () => {
        const data = { ...baseLog, session_id: null };
        expect(PracticeLogRowSchema.safeParse(data).success).toBe(true);
    });

    it('缺少 question_id 时应验证失败', () => {
        const { question_id: _, ...noQid } = baseLog;
        expect(PracticeLogRowSchema.safeParse(noQid).success).toBe(false);
    });
});

// ---- QuestionRowSchema ----

describe('QuestionRowSchema（题目数据库行验证）', () => {
    const baseRow = {
        id: 1,
        content: '这是一道题目内容，长度超过五个字符',
        options: JSON.stringify(['选项A', '选项B', '选项C']),
        answer: 'A',
        explanation: '这是详细的解析，长度超过五个字符',
        tags: JSON.stringify(['标签1', '标签2']),
        dimension: 'knowledge',
        type: 'single',
    };

    it('合法数据应通过验证', () => {
        expect(QuestionRowSchema.safeParse(baseRow).success).toBe(true);
    });

    it('options 字符串 JSON 应自动解析为数组', () => {
        const result = QuestionRowSchema.safeParse(baseRow);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(Array.isArray(result.data.options)).toBe(true);
            expect(result.data.options).toHaveLength(3);
        }
    });

    it('tags 字符串 JSON 应自动解析为数组', () => {
        const result = QuestionRowSchema.safeParse(baseRow);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(Array.isArray(result.data.tags)).toBe(true);
            expect(result.data.tags).toContain('标签1');
        }
    });

    it('options 已为数组时也应通过验证', () => {
        const data = { ...baseRow, options: ['选项A', '选项B'] };
        expect(QuestionRowSchema.safeParse(data).success).toBe(true);
    });

    it('无效 JSON 的 options 应容错为空数组', () => {
        const data = { ...baseRow, options: 'invalid-json' };
        const result = QuestionRowSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.options).toEqual([]);
        }
    });

    it('缺少 id 时应验证失败', () => {
        const { id: _, ...noId } = baseRow;
        expect(QuestionRowSchema.safeParse(noId).success).toBe(false);
    });
});

// ---- CorrectionQuizSchema ----

describe('CorrectionQuizSchema（找茬对比题 Schema）', () => {
    const validData = {
        analysis: '错误选项与正确选项的区别分析',
        distinctionPoint: '区分两个概念的核心逻辑点',
        quiz: {
            content: '针对该逻辑点生成的辨析题',
            options: ['选项A', '选项B'],
            answer: 'A',
            explanation: '解析说明',
        },
    };

    it('合法数据应通过验证', () => {
        expect(CorrectionQuizSchema.safeParse(validData).success).toBe(true);
    });

    it('缺少 analysis 时应验证失败', () => {
        const { analysis: _, ...noAnalysis } = validData;
        expect(CorrectionQuizSchema.safeParse(noAnalysis).success).toBe(false);
    });

    it('缺少 quiz.content 时应验证失败', () => {
        const data = { ...validData, quiz: { ...validData.quiz, content: undefined } };
        expect(CorrectionQuizSchema.safeParse(data).success).toBe(false);
    });

    it('quiz.options 必须为数组', () => {
        const data = { ...validData, quiz: { ...validData.quiz, options: 'not-array' } };
        expect(CorrectionQuizSchema.safeParse(data).success).toBe(false);
    });
});

// ---- RegressionChallengeSchema ----

describe('RegressionChallengeSchema（逆向回归挑战 Schema）', () => {
    const makeChallenge = () => ({
        content: '挑战题目内容',
        options: ['选项A', '选项B'],
        answer: 'A',
        explanation: '解析说明',
    });

    const validData = {
        logicType: 'reverse' as const,
        challenges: [makeChallenge(), makeChallenge(), makeChallenge()],
    };

    it('合法数据（3 道挑战题）应通过验证', () => {
        expect(RegressionChallengeSchema.safeParse(validData).success).toBe(true);
    });

    it('challenges 数量不等于 3 时应验证失败', () => {
        const data = { ...validData, challenges: [makeChallenge(), makeChallenge()] };
        expect(RegressionChallengeSchema.safeParse(data).success).toBe(false);
    });

    it('logicType 为无效枚举值时应验证失败', () => {
        const data = { ...validData, logicType: 'invalid' };
        expect(RegressionChallengeSchema.safeParse(data).success).toBe(false);
    });

    it('logicType 为 "complement" 时应通过验证', () => {
        const data = { ...validData, logicType: 'complement' as const };
        expect(RegressionChallengeSchema.safeParse(data).success).toBe(true);
    });

    it('logicType 为 "boundary" 时应通过验证', () => {
        const data = { ...validData, logicType: 'boundary' as const };
        expect(RegressionChallengeSchema.safeParse(data).success).toBe(true);
    });
});
