// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock authenticatedAction
vi.mock('@/lib/safe-action', () => ({
    authenticatedAction: {
        action: vi.fn((fn) => {
            return async function() {
                return fn({ ctx: { user: { id: '1' } } });
            };
        }),
        inputSchema: vi.fn(() => ({
            action: vi.fn((fn) => {
                return async function(input: any) {
                    return fn({ parsedInput: input, ctx: { user: { id: '1' } } });
                };
            })
        }))
    }
}));

// Mock drizzle
const { mockSelect, mockDelete, mockInsert, mockTransaction } = vi.hoisted(() => ({
    mockSelect: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
                { user_id: 1, tag_name: 'tag1', score: 80, history: '{}', last_updated: '2024-01-01' }
            ])
        })
    }),
    mockDelete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({})
    }),
    mockInsert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({})
    }),
    mockTransaction: vi.fn(async (cb) => {
        const tx = {
            delete: mockDelete,
            insert: mockInsert
        };
        return cb(tx);
    })
}));

vi.mock('@/lib/db', () => ({
    drizzleDb: {
        select: mockSelect,
        delete: mockDelete,
        insert: mockInsert,
        transaction: mockTransaction
    },
    drizzleSchema: {
        user_mastery: { user_id: 'user_mastery.user_id', tag_name: 'user_mastery.tag_name' },
        practice_logs: { user_id: 'practice_logs.user_id', session_id: 'practice_logs.session_id' },
        observation_zone: { user_id: 'observation_zone.user_id', tag_name: 'observation_zone.tag_name' }
    }
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((a, b) => ({ type: 'eq', a, b }))
}));

import { exportUserDataAction, importUserDataAction } from '../data';

describe('Data Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('exportUserDataAction', () => {
        it('should export user mastery, practice logs, and observation zone', async () => {
            const result = await exportUserDataAction();

            expect(result).toHaveProperty('version', 1);
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('user_mastery');
            expect(result).toHaveProperty('practice_logs');
            expect(result).toHaveProperty('observation_zone');
        });

        it('should return arrays with correct data structure', async () => {
            const result = await exportUserDataAction();

            expect(Array.isArray(result.user_mastery)).toBe(true);
            expect(Array.isArray(result.practice_logs)).toBe(true);
            expect(Array.isArray(result.observation_zone)).toBe(true);
        });
    });

    describe('importUserDataAction', () => {
        it('should import valid backup data', async () => {
            const backupData = {
                version: 1,
                timestamp: '2024-01-01T00:00:00Z',
                user_mastery: [
                    { tag_name: '数学', score: 90, history: '{}', last_updated: '2024-01-01' }
                ],
                practice_logs: [
                    { session_id: 's1', question_id: 1, user_answer: 'A', is_correct: 1, is_monitored_correct: 1, duration_ms: 5000, timestamp: '2024-01-01' }
                ],
                observation_zone: [
                    { tag_name: '难点', reason: '需要加强', entered_at: '2024-01-01', status: 'active' }
                ]
            };

            const result = await importUserDataAction(backupData);

            expect(result).toHaveProperty('success', true);
            expect(result).toHaveProperty('message', '数据导入成功');
        });

        it('should reject backup with wrong version', async () => {
            const invalidBackup = {
                version: 999,
                timestamp: '2024-01-01T00:00:00Z',
                user_mastery: [],
                practice_logs: [],
                observation_zone: []
            };

            await expect(importUserDataAction(invalidBackup)).rejects.toThrow('备份版本不匹配');
        });

        it('should handle empty data', async () => {
            const emptyBackup = {
                version: 1,
                timestamp: '2024-01-01T00:00:00Z',
                user_mastery: [],
                practice_logs: [],
                observation_zone: []
            };

            const result = await importUserDataAction(emptyBackup);

            expect(result).toHaveProperty('success', true);
        });
    });
});