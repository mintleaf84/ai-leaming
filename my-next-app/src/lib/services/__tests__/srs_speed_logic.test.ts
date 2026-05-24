import { describe, it, expect, vi, beforeEach } from 'vitest';
import { srsService } from '../srs';
import { Rating, createEmptyCard } from 'ts-fsrs';

// 用于捕获数据
let capturedValues: any[] = [];
let mockQuestion: any = null;
let mockSrs: any = null;
let mockSettings: Record<string, string> = {};

vi.mock('@/lib/db', () => {
    const drizzleMock: any = {
        select: vi.fn((fields) => {
            const chain: any = {
                from: vi.fn((table) => {
                    const tableName = (table as any).name || (table as any)[Symbol.for('drizzle:Name')] || (table as any)._?.name || 'unknown_table';
                    const tableChain: any = {
                        where: vi.fn(() => {
                            const whereChain: any = {
                                limit: vi.fn(() => ({
                                    then: (resolve: any) => {
                                        if (tableName === 'questions') return resolve(mockQuestion ? [mockQuestion] : []);
                                        if (tableName === 'question_srs') return resolve(mockSrs ? [mockSrs] : []);
                                        if (tableName === 'system_settings') {
                                            return resolve(Object.entries(mockSettings).map(([key, value]) => ({ key, value })));
                                        }
                                        return resolve([]);
                                    }
                                })),
                                all: vi.fn().mockImplementation(() => {
                                    if (tableName === 'system_settings') {
                                        return Object.entries(mockSettings).map(([key, value]) => ({ key, value }));
                                    }
                                    return [];
                                }),
                                then: (resolve: any) => {
                                     if (tableName === 'system_settings') {
                                         return resolve(Object.entries(mockSettings).map(([key, value]) => ({ key, value })));
                                     }
                                     if (tableName === 'questions') return resolve(mockQuestion ? [mockQuestion] : []);
                                     if (tableName === 'question_srs') return resolve(mockSrs ? [mockSrs] : []);
                                     return resolve([]);
                                }
                            };
                            return whereChain;
                        }),
                        then: (resolve: any) => resolve([]) // 兜底处理 select().from() 直接 await
                    };
                    return tableChain;
                })
            };
            return chain;
        }),
        insert: vi.fn((table) => {
            const chain: any = new Proxy(() => {}, {
                get: (_, prop) => {
                    if (prop === 'values') {
                        return (data: any) => {
                            capturedValues.push(data);
                            return chain;
                        };
                    }
                    if (prop === 'onConflictDoUpdate') return () => Promise.resolve({ changes: 1 });
                    return chain;
                },
                apply: () => chain
            });
            return chain;
        }),
        query: {
            questions: { 
                findFirst: vi.fn().mockImplementation(() => Promise.resolve(mockQuestion)) 
            },
            question_srs: { 
                findFirst: vi.fn().mockImplementation(() => Promise.resolve(mockSrs)) 
            },
            system_settings: {
                findFirst: vi.fn().mockImplementation(() => Promise.resolve(null))
            }
        }
    };
    return {
        default: drizzleMock,
        db: drizzleMock,
        drizzleDb: drizzleMock,
        drizzleSchema: {
            questions: { name: 'questions' },
            question_srs: { name: 'question_srs' },
            system_settings: { name: 'system_settings' },
            practice_logs: { name: 'practice_logs' }
        }
    };
});

describe('srsService - Speed Learning Logic (Best Practices)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedValues = [];
        mockQuestion = null;
        mockSrs = null;
        mockSettings = {};
    });

    it('should learn and update reading speed when answering correctly', async () => {
        mockQuestion = {
            id: 101,
            content: '这是一段测试文本内容，长度超过十个字。', // 20 chars
            options: '[]',
            type: 'single'
        };
        mockSrs = {
            stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString()
        };

        await srsService.updateQuestionSrs(1, 101, true, 1000);

        // 使用 waitFor 等待异步副作用执行完成
        await vi.waitFor(() => {
            const update = capturedValues.find(v => v.key === 'reading_speed_base');
            if (!update) throw new Error('Not updated yet');
            // 文本长度 19, 耗时 1s, 速度 19 字/秒。EMA: 7 * 0.9 + 19 * 0.1 = 8.2
            expect(parseFloat(update.value)).toBeCloseTo(8.2, 1);
        }, { timeout: 1000 });
    });

    it('should learn speed for MULTI questions independently', async () => {
        mockQuestion = {
            id: 201,
            content: '多选题题干内容', // 7 chars
            options: '["选项A", "选项B"]', // 6 chars, total 13
            type: 'multi'
        };
        mockSrs = {
            stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString()
        };

        await srsService.updateQuestionSrs(1, 201, true, 1300);

        await vi.waitFor(() => {
            const update = capturedValues.find(v => v.key === 'reading_speed_multi');
            if (!update) throw new Error('Not updated yet');
            expect(parseFloat(update.value)).toBeCloseTo(7.3, 1);
        });
    });

    it('should learn speed for TRUEFALSE questions independently', async () => {
        mockQuestion = {
            id: 301,
            content: '判断题题干内容', // 7 chars
            options: '["正确", "错误"]', // 4 chars, total 11
            type: 'truefalse'
        };
        mockSrs = {
            stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString()
        };

        await srsService.updateQuestionSrs(1, 301, true, 1100);

        await vi.waitFor(() => {
            const update = capturedValues.find(v => v.key === 'reading_speed_truefalse');
            if (!update) throw new Error('Not updated yet');
            expect(parseFloat(update.value)).toBeCloseTo(7.3, 1);
        });
    });

    it('should learn speed for FILL_BLANK questions with user answer length', async () => {
        mockQuestion = {
            id: 401,
            content: '填空题题干内容', // 7 chars
            options: '[]',
            type: 'fill_blank'
        };
        mockSrs = {
            stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString()
        };

        await srsService.updateQuestionSrs(1, 401, true, 2000, undefined, undefined, 6);

        await vi.waitFor(() => {
            const update = capturedValues.find(v => v.key === 'reading_speed_fill_blank');
            if (!update) throw new Error('Not updated yet');
            expect(parseFloat(update.value)).toBeCloseTo(7.0, 1);
        });
    });

    it('should NOT learn speed when answer is incorrect', async () => {
        mockQuestion = { id: 102, content: '内容', options: '[]' };
        mockSrs = { stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString() };

        await srsService.updateQuestionSrs(1, 102, false, 2000);

        // 延迟确认没有调用
        await new Promise(r => setTimeout(r, 50));
        const update = capturedValues.find(v => v.key === 'reading_speed_base');
        expect(update).toBeUndefined();
    });

    it('should NOT learn speed when duration is an outlier', async () => {
        mockQuestion = { id: 103, content: '内容内容内容内容内容', options: '[]' };
        mockSrs = { stability: 1, difficulty: 5, state: 0, reps: 0, lapses: 0, due_date: new Date().toISOString() };

        await srsService.updateQuestionSrs(1, 103, true, 120000);

        await new Promise(r => setTimeout(r, 50));
        const update = capturedValues.find(v => v.key === 'reading_speed_base');
        expect(update).toBeUndefined();
    });
});
