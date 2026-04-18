// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateFenbiJson, parseFenbiData } from '../fenbi-parser';

// ==================== 辅助：构造最小合法测试数据 ====================

function makeExercise(userAnswers: Record<string, object> = {}) {
    return JSON.stringify({ userAnswers });
}

function makeSolutions(solutions: object[] = [{ id: 1, globalId: 'q1', type: 1, content: '测试题', solution: '解析', accessories: [{ options: ['A', 'B', 'C', 'D'], type: 1 }], correctAnswer: { choice: '0', type: 1 }, keypoints: [] }]) {
    return JSON.stringify({ solutions, name: '测试题集' });
}

// ==================== validateFenbiJson ====================

describe('validateFenbiJson（数据验证）', () => {
    it('合法数据应返回 valid: true', () => {
        const result = validateFenbiJson(makeExercise(), makeSolutions());
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it('无效 JSON 应返回 valid: false', () => {
        const result = validateFenbiJson('not-json', '{}');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('JSON 解析失败');
    });

    it('缺少 userAnswers 字段应返回 valid: false', () => {
        const result = validateFenbiJson(JSON.stringify({ foo: 'bar' }), makeSolutions());
        expect(result.valid).toBe(false);
        expect(result.error).toContain('userAnswers');
    });

    it('缺少 solutions 字段应返回 valid: false', () => {
        const result = validateFenbiJson(makeExercise(), JSON.stringify({ foo: [] }));
        expect(result.valid).toBe(false);
        expect(result.error).toContain('solutions');
    });

    it('solutions 为空数组应返回 valid: false', () => {
        const result = validateFenbiJson(makeExercise(), JSON.stringify({ solutions: [] }));
        expect(result.valid).toBe(false);
        expect(result.error).toContain('题目数据为空');
    });

    it('solutions 不是数组应返回 valid: false', () => {
        const result = validateFenbiJson(makeExercise(), JSON.stringify({ solutions: 'string' }));
        expect(result.valid).toBe(false);
    });

    it('支持带 data 包裹的答题数据格式', () => {
        const exercise = JSON.stringify({ data: { userAnswers: { q1: {} } } });
        const result = validateFenbiJson(exercise, makeSolutions());
        expect(result.valid).toBe(true);
    });
});

// ==================== parseFenbiData ====================

describe('parseFenbiData（主解析函数）', () => {
    it('解析单选题', () => {
        const exercise = makeExercise({ 'q1': { key: 'q1', answer: { choice: '0', type: 1 }, status: 1, time: 10, scoreRate: 1, id: 1 } });
        const solutions = makeSolutions([{
            id: 1,
            globalId: 'q1',
            type: 1,       // 单选
            content: '<p>单选题内容</p>',
            solution: '<p>解析内容</p>',
            accessories: [{ options: ['选A', '选B', '选C', '选D'], type: 1 }],
            correctAnswer: { choice: '0', type: 1 },
            keypoints: [{ id: 1, name: '知识点A' }],
        }]);

        const result = parseFenbiData(exercise, solutions);

        expect(result.questions).toHaveLength(1);
        const q = result.questions[0];
        expect(q.externalId).toBe('q1');
        expect(q.type).toBe('single');
        expect(q.answer).toBe('A');   // index 0 → A
        expect(q.options).toEqual(['选A', '选B', '选C', '选D']);
        expect(q.tags).toEqual(['知识点A']);
        expect(q.content).toContain('单选题内容');
    });

    it('解析判断题', () => {
        const exercise = makeExercise({});
        const solutions = JSON.stringify({
            solutions: [{
                id: 2,
                globalId: 'q2',
                type: 5,   // 判断题
                content: '判断题内容',
                solution: '判断解析',
                accessories: [],
                correctAnswer: { choice: '0', type: 5 },
                keypoints: [],
            }],
            name: '判断题集',
        });

        const result = parseFenbiData(exercise, solutions);
        const q = result.questions[0];
        expect(q.type).toBe('boolean');
        expect(q.answer).toBe('正确');   // '0' → '正确'
        expect(q.options).toEqual(['正确', '错误']);
    });

    it('解析多选题', () => {
        const exercise = makeExercise({});
        const solutions = JSON.stringify({
            solutions: [{
                id: 3,
                globalId: 'q3',
                type: 2,   // 多选
                content: '多选题内容',
                solution: '多选解析',
                accessories: [{ options: ['A', 'B', 'C', 'D'], type: 2 }],
                correctAnswer: { choice: '0,2', type: 2 },  // A, C
                keypoints: [],
            }],
            name: '多选题集',
        });

        const result = parseFenbiData(exercise, solutions);
        const q = result.questions[0];
        expect(q.type).toBe('multi');
        expect(q.answer).toBe('A,C');
    });

    it('解析作答记录（答对）', () => {
        const exercise = JSON.stringify({
            userAnswers: {
                'q1': { key: 'q1', answer: { choice: '0', type: 1 }, status: 1, time: 15, scoreRate: 1, id: 1 },
            }
        });
        const result = parseFenbiData(exercise, makeSolutions());

        expect(result.records).toHaveLength(1);
        const r = result.records[0];
        expect(r.externalId).toBe('q1');
        expect(r.isCorrect).toBe(true);
        expect(r.durationMs).toBe(15000); // 15 秒 → 15000 毫秒
    });

    it('解析作答记录（答错）', () => {
        const exercise = JSON.stringify({
            userAnswers: {
                'q1': { key: 'q1', answer: { choice: '1', type: 1 }, status: -1, time: 20, scoreRate: 0, id: 1 },
            }
        });
        const result = parseFenbiData(exercise, makeSolutions());

        const r = result.records[0];
        expect(r.isCorrect).toBe(false);
        expect(r.userAnswer).toBe('B');   // '1' → B
    });

    it('会话名称从 solutionsData.name 读取', () => {
        const result = parseFenbiData(makeExercise(), makeSolutions());
        expect(result.sessionName).toBe('测试题集');
    });

    it('会话名称兜底使用 exerciseData.name', () => {
        const exercise = JSON.stringify({ userAnswers: {}, name: '我的答题会话' });
        const solutions = JSON.stringify({ solutions: [{ id: 1, globalId: 'q1', type: 1, content: 'Q', solution: 'S', accessories: [{ options: ['A', 'B'], type: 1 }], correctAnswer: { choice: '0', type: 1 }, keypoints: [] }] });
        const result = parseFenbiData(exercise, solutions);
        expect(result.sessionName).toBe('我的答题会话');
    });

    it('统计数据正确率 totalCount 应被解析', () => {
        const exercise = makeExercise({});
        const solutions = JSON.stringify({
            solutions: [{
                id: 1, globalId: 'q1', type: 1, content: 'Q', solution: 'S',
                accessories: [{ options: ['A', 'B'], type: 1 }],
                correctAnswer: { choice: '0', type: 1 }, keypoints: [],
            }],
            name: '统计题集',
        });
        const stats = JSON.stringify({
            data: {
                '1': {
                    id: 1,
                    totalCount: 10000,
                    correctRatio: 65.5,
                    mostWrongAnswer: { choice: '1', type: 1 },
                }
            }
        });

        const result = parseFenbiData(exercise, solutions, stats);
        const q = result.questions[0];
        expect(q.stats).toBeDefined();
        expect(q.stats?.totalAnswers).toBe(10000);
        expect(q.stats?.correctRatio).toBe(65.5);
        expect(q.stats?.mostWrongAnswer).toBe('B');   // index '1' → B
    });

    it('支持 object 类型输入', () => {
        const exercise = { userAnswers: {} };
        const solutions = { solutions: [{ id: 1, globalId: 'q1', type: 1, content: 'Q', solution: 'S', accessories: [{ options: ['A', 'B'], type: 1 }], correctAnswer: { choice: '0', type: 1 }, keypoints: [] }], name: '对象输入测试' };
        const result = parseFenbiData(exercise, solutions);
        expect(result.questions).toHaveLength(1);
    });

    it('多道题时 totalCount/correctCount 应正确统计', () => {
        const exercise = JSON.stringify({
            userAnswers: {
                'q1': { key: 'q1', answer: { choice: '0', type: 1 }, status: 1, time: 10, scoreRate: 1, id: 1 },
                'q2': { key: 'q2', answer: { choice: '1', type: 1 }, status: -1, time: 5, scoreRate: 0, id: 2 },
            }
        });
        const solutions = JSON.stringify({
            solutions: [
                { id: 1, globalId: 'q1', type: 1, content: 'Q1', solution: 'S1', accessories: [{ options: ['A', 'B'], type: 1 }], correctAnswer: { choice: '0', type: 1 }, keypoints: [] },
                { id: 2, globalId: 'q2', type: 1, content: 'Q2', solution: 'S2', accessories: [{ options: ['A', 'B'], type: 1 }], correctAnswer: { choice: '0', type: 1 }, keypoints: [] },
            ],
            name: '两题测试',
        });

        const result = parseFenbiData(exercise, solutions);
        expect(result.totalCount).toBe(2);
        expect(result.correctCount).toBe(1);
        expect(result.errorCount).toBe(1);
    });
});
