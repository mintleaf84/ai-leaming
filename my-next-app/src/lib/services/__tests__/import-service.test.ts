// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importService } from '../import-service';

// 1. Mock Drizzle DB and Schema
const { mockDrizzleDb, mockDrizzleSchema } = vi.hoisted(() => {
    const makeChain = () => {
        const chain: any = {
            then: vi.fn((resolve) => resolve([])),
        };
        const methods = [
            'insert', 'values', 'update', 'set', 'delete', 'select', 
            'from', 'where', 'limit', 'offset', 'orderBy', 'all', 
            'innerJoin', 'leftJoin', 'onConflictDoUpdate', 'returning'
        ];
        methods.forEach((m) => {
            chain[m] = vi.fn(() => chain);
        });
        return chain;
    };

    const chain = makeChain();
    const mockDrizzleDb = {
        ...chain,
        transaction: vi.fn(async (cb) => cb(chain)),
    };

    return { 
        mockDrizzleDb, 
        mockDrizzleSchema: {
            practice_sessions: { id: 'id' },
            questions: { id: 'id', external_id: 'external_id' },
            practice_logs: { id: 'id' },
            user_mastery: { id: 'id', user_id: 'user_id', tag_name: 'tag_name' }
        } 
    };
});

vi.mock('../../db', () => ({
    drizzleDb: mockDrizzleDb,
    drizzleSchema: mockDrizzleSchema,
}));

vi.mock('../../utils/security', () => ({
    sanitizeHtml: vi.fn((html) => html),
}));

describe('Import Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // 重置链式调用行为
        const chain = mockDrizzleDb as any;
        const methods = [
            'insert', 'values', 'update', 'set', 'delete', 'select', 
            'from', 'where', 'limit', 'offset', 'orderBy', 'all', 
            'innerJoin', 'leftJoin', 'onConflictDoUpdate', 'returning'
        ];
        methods.forEach(m => chain[m].mockReturnValue(chain));
        
        // 默认返回结果
        chain.returning.mockResolvedValue([{ id: 123 }]);
    });

    it('should successfully import data and create session', async () => {
        const userId = 1;
        const data = {
            sessionName: 'Test Session',
            totalCount: 1,
            correctCount: 1,
            errorCount: 0,
            questions: [{
                externalId: 'ext-1',
                content: 'Question 1',
                type: 'single',
                options: ['A', 'B'],
                answer: 'A',
                explanation: 'Explain',
                tags: ['Tag1'],
                dimension: 'knowledge'
            }],
            records: [{
                externalId: 'ext-1',
                userAnswer: 'A',
                isCorrect: true,
                durationMs: 1000
            }]
        } as any;

        const result = await importService.importFenbiData(userId, data);

        expect(result.importedCount).toBe(1);
        expect(result.newQuestionsCount).toBe(1);
        expect(mockDrizzleDb.transaction).toHaveBeenCalled();
        expect(mockDrizzleDb.insert).toHaveBeenCalledWith(mockDrizzleSchema.practice_sessions);
        expect(mockDrizzleDb.insert).toHaveBeenCalledWith(mockDrizzleSchema.questions);
        expect(mockDrizzleDb.insert).toHaveBeenCalledWith(mockDrizzleSchema.practice_logs);
        expect(mockDrizzleDb.insert).toHaveBeenCalledWith(mockDrizzleSchema.user_mastery);
    });

    it('should handle upsert logic for questions', async () => {
        const userId = 1;
        const data = {
            sessionName: 'Test',
            totalCount: 1,
            correctCount: 0,
            errorCount: 0,
            questions: [{
                externalId: 'ext-1',
                content: 'Updated Content',
                type: 'single',
                options: [],
                answer: 'A',
                explanation: 'Updated Exp',
                tags: [],
                dimension: 'knowledge'
            }],
            records: []
        } as any;

        await importService.importFenbiData(userId, data);

        expect(mockDrizzleDb.onConflictDoUpdate).toHaveBeenCalled();
        // 验证 target 是否正确 (应该包含 external_id)
        const call = vi.mocked(mockDrizzleDb.onConflictDoUpdate).mock.calls[0][0];
        expect(call.target).toEqual(mockDrizzleSchema.questions.external_id);
    });

    it('should update mastery counts correctly', async () => {
        const userId = 1;
        const data = {
            sessionName: 'Test Mastery',
            totalCount: 1,
            correctCount: 1,
            errorCount: 0,
            questions: [{
                externalId: 'ext-1',
                tags: ['History', 'Modern'],
                dimension: 'knowledge',
                content: 'Q', options: [], answer: 'A', explanation: '', type: 'single'
            }],
            records: [{
                externalId: 'ext-1',
                isCorrect: true
            }]
        } as any;

        await importService.importFenbiData(userId, data);

        // 两个 tag，应该调用两次 insert 到 user_mastery (或者批量插入，但当前实现是循环调用)
        const masteryInserts = vi.mocked(mockDrizzleDb.insert).mock.calls.filter((c: any) => c[0] === mockDrizzleSchema.user_mastery);
        expect(masteryInserts.length).toBe(2);
    });
});
