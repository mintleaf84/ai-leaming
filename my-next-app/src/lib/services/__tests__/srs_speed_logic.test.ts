
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { srsService } from '../srs';
import { Rating } from 'ts-fsrs';
import { drizzleDb, drizzleSchema } from '@/lib/db';

// 注意：由于 srs.ts 内部使用了异步 learnReadingSpeed().catch()，我们需要等待微任务
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 用于捕获 values 调用的参数
let capturedValues: any[] = [];

vi.mock('@/lib/db', () => {
    const mockRun = vi.fn();
    const mockOnConflict = vi.fn(() => ({ run: mockRun }));
    const mockValues = vi.fn((data: any) => {
        capturedValues.push(data);
        return { onConflictDoUpdate: mockOnConflict };
    });
    const mockInsert = vi.fn(() => ({ values: mockValues }));

    return {
        drizzleDb: {
            query: {
                questions: {
                    findFirst: vi.fn(),
                },
                question_srs: {
                    findFirst: vi.fn(),
                },
                system_settings: {
                    findFirst: vi.fn(),
                }
            },
            insert: mockInsert,
            // 补全 updateQuestionSrs 需要的其他 mock
            select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn() })) })) })),
        },
        drizzleSchema: {
            questions: { id: 1 },
            question_srs: { user_id: 1, question_id: 1, due_date: 'due_date' },
            system_settings: { user_id: 1, key: 'key', value: 'value' },
            practice_logs: { user_id: 1, question_id: 1 }
        },
        db: {}
    };
});

describe('srsService - Speed Learning Logic', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
        capturedValues = [];
    });

    it('should learn and update reading speed when answering correctly', async () => {
        const userId = 1;
        const questionId = 101;
        
        // 1. Mock 题目：字数
        (drizzleDb.query.questions.findFirst as any).mockResolvedValue({
            id: questionId,
            content: '这是一段测试文本内容，长度超过十个字。', // 20 chars
            options: '[]',
            type: 'single'
        });

        // 2. Mock 当前 SRS 状态
        (drizzleDb.query.question_srs.findFirst as any).mockResolvedValue({
            stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString()
        });

        // 3. Mock 初始速度：返回 null 使用默认值 7
        (drizzleDb.query.system_settings.findFirst as any).mockResolvedValue(null);

        // 4. 执行更新：耗时 1000ms (1s)
        // 本次速度 = 20 / 1 = 20 字/s
        // EMA 更新：7 * 0.9 + 20 * 0.1 = 6.3 + 2.0 = 8.3
        await srsService.updateQuestionSrs(userId, questionId, true, 1000);

        // 等待异步 catch 块执行
        await wait(50);

        // 验证结果
        const speedUpdate = capturedValues.find(v => v.key === 'reading_speed_base');
        expect(speedUpdate).toBeDefined();
        expect(parseFloat(speedUpdate.value)).toBeCloseTo(8.2, 1);
    });

    it('should learn speed for MULTI questions independently', async () => {
        const userId = 1;
        const questionId = 201;
        
        (drizzleDb.query.questions.findFirst as any).mockResolvedValue({
            id: questionId,
            content: '多选题题干内容', // 7 chars
            options: '["选项A", "选项B"]', // 6 chars, total 13
            type: 'multi'
        });
        (drizzleDb.query.question_srs.findFirst as any).mockResolvedValue({
            stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString()
        });
        (drizzleDb.query.system_settings.findFirst as any).mockResolvedValue(null);

        // 耗时 1300ms -> 10 chars/s
        // EMA: 7 * 0.9 + 10 * 0.1 = 6.3 + 1 = 7.3
        await srsService.updateQuestionSrs(userId, questionId, true, 1300);
        await wait(50);

        const speedUpdate = capturedValues.find(v => v.key === 'reading_speed_multi');
        expect(speedUpdate).toBeDefined();
        expect(parseFloat(speedUpdate.value)).toBeCloseTo(7.3, 1);
    });

    it('should learn speed for TRUEFALSE questions independently', async () => {
        const userId = 1;
        const questionId = 301;
        
        (drizzleDb.query.questions.findFirst as any).mockResolvedValue({
            id: questionId,
            content: '判断题题干内容', // 7 chars
            options: '["正确", "错误"]', // 4 chars, total 11
            type: 'truefalse'
        });
        (drizzleDb.query.question_srs.findFirst as any).mockResolvedValue({
            stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString()
        });
        (drizzleDb.query.system_settings.findFirst as any).mockResolvedValue(null);

        // 耗时 1100ms -> 10 chars/s
        // EMA: 7 * 0.9 + 10 * 0.1 = 6.3 + 1 = 7.3
        await srsService.updateQuestionSrs(userId, questionId, true, 1100);
        await wait(50);

        const speedUpdate = capturedValues.find(v => v.key === 'reading_speed_truefalse');
        expect(speedUpdate).toBeDefined();
        expect(parseFloat(speedUpdate.value)).toBeCloseTo(7.3, 1);
    });

    it('should NOT learn speed when answer is incorrect', async () => {
        const userId = 1;
        const questionId = 102;
        
        (drizzleDb.query.questions.findFirst as any).mockResolvedValue({
            id: questionId, content: '测试内容测试内容', options: '[]'
        });
        (drizzleDb.query.question_srs.findFirst as any).mockResolvedValue({
            stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString()
        });

        await srsService.updateQuestionSrs(userId, questionId, false, 2000);
        await wait(50);

        const speedUpdate = capturedValues.find(v => v.key === 'reading_speed_base');
        expect(speedUpdate).toBeUndefined();
    });

    it('should NOT learn speed when duration is an outlier (too long)', async () => {
        const userId = 1;
        const questionId = 103;
        
        (drizzleDb.query.questions.findFirst as any).mockResolvedValue({
            id: questionId, content: '测试内容测试内容', options: '[]'
        });
        (drizzleDb.query.question_srs.findFirst as any).mockResolvedValue({
            stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString()
        });

        // 耗时 120s 超过 60s 限制
        await srsService.updateQuestionSrs(userId, questionId, true, 120000);
        await wait(50);

        const speedUpdate = capturedValues.find(v => v.key === 'reading_speed_base');
        expect(speedUpdate).toBeUndefined();
    });
});
