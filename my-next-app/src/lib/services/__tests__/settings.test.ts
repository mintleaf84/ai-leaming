// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 使用 vi.hoisted 确保 mock 在 vi.mock 之前初始化
const { mockSelect, mockFrom, mockWhere, mockAll, mockInsert, mockValues, mockOnConflictDoUpdate, mockDelete, mockTransaction } = vi.hoisted(() => {
    // 先创建所有 mock
    const mockAll = vi.fn();
    const mockWhere = vi.fn();
    const mockFrom = vi.fn();
    const mockValues = vi.fn();
    const mockOnConflictDoUpdate = vi.fn();
    const mockSelect = vi.fn();
    const mockInsert = vi.fn();
    const mockDelete = vi.fn();
    const mockTransaction = vi.fn();

    // 然后设置链式调用的返回值
    mockSelect.mockReturnValue({ from: mockFrom, where: mockWhere });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ all: mockAll });
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockOnConflictDoUpdate.mockResolvedValue({});
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue({}) });

    return { mockSelect, mockFrom, mockWhere, mockAll, mockInsert, mockValues, mockOnConflictDoUpdate, mockDelete, mockTransaction };
});

// 设置 transaction mock
mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb({ delete: mockDelete });
});

vi.mock('@/lib/db', () => ({
    drizzleDb: {
        select: mockSelect,
        insert: mockInsert,
        delete: mockDelete,
        transaction: mockTransaction,
    },
    drizzleSchema: {
        system_settings: { user_id: 'user_id', key: 'key', value: 'value', updated_at: 'updated_at' },
        practice_logs: { user_id: 'user_id' },
        practice_sessions: { user_id: 'user_id' },
        user_mastery: { user_id: 'user_id' },
        observation_zone: { user_id: 'user_id' },
        chat_sessions: { user_id: 'user_id' },
        knowledge_cards: { user_id: 'user_id' },
    },
}));

import { settingsService, type SystemSettings } from '@/lib/services/settings';

describe('SettingsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 重置链式调用的返回值
        mockSelect.mockReturnValue({ from: mockFrom, where: mockWhere });
        mockFrom.mockReturnValue({ where: mockWhere });
        mockWhere.mockReturnValue({ all: mockAll });
        mockInsert.mockReturnValue({ values: mockValues });
        mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
        mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue({}) });
    });

    // ────────────────────────────
    // getSettings
    // ────────────────────────────
    describe('getSettings', () => {
        it('应该返回默认设置当无数据时', async () => {
            mockAll.mockResolvedValue([]);

            const result = await settingsService.getSettings(1);

            expect(result.reviewThreshold).toBe(60);
            expect(result.aiSeverity).toBe('medium');
            expect(result.darkMode).toBe(false);
        });

        it('应该正确返回已存储的设置', async () => {
            mockAll.mockResolvedValue([
                { key: 'review_threshold', value: '80' },
                { key: 'ai_severity', value: 'high' },
                { key: 'dark_mode', value: 'true' },
            ]);

            const result = await settingsService.getSettings(1);

            expect(result.reviewThreshold).toBe(80);
            expect(result.aiSeverity).toBe('high');
            expect(result.darkMode).toBe(true);
        });

        it('应该处理部分设置缺失的情况', async () => {
            mockAll.mockResolvedValue([
                { key: 'review_threshold', value: '75' },
            ]);

            const result = await settingsService.getSettings(1);

            expect(result.reviewThreshold).toBe(75);
            expect(result.aiSeverity).toBe('medium'); // 默认值
            expect(result.darkMode).toBe(false); // 默认值
        });

        it('应该正确解析 dark_mode 字符串值', async () => {
            mockAll.mockResolvedValue([
                { key: 'dark_mode', value: 'false' },
            ]);

            const result = await settingsService.getSettings(1);

            expect(result.darkMode).toBe(false);
        });
    });

    // ────────────────────────────
    // updateSettings
    // ────────────────────────────
    describe('updateSettings', () => {
        it('应该更新单个设置', async () => {
            await settingsService.updateSettings(1, { reviewThreshold: 85 });

            expect(mockInsert).toHaveBeenCalled();
        });

        it('应该更新多个设置', async () => {
            await settingsService.updateSettings(1, {
                reviewThreshold: 90,
                aiSeverity: 'high',
                darkMode: true,
            });

            // 验证调用了 3 次 insert（每次一个设置）
            expect(mockInsert).toHaveBeenCalledTimes(3);
        });

        it('空更新时应该直接返回', async () => {
            await settingsService.updateSettings(1, {});

            expect(mockInsert).not.toHaveBeenCalled();
        });

        it('应该跳过 undefined 的字段', async () => {
            const settings: Partial<SystemSettings> = {
                reviewThreshold: 70,
                // aiSeverity 和 darkMode 为 undefined
            };

            await settingsService.updateSettings(1, settings);

            // 只应该调用一次 insert（只更新 reviewThreshold）
            expect(mockInsert).toHaveBeenCalledTimes(1);
        });
    });

    // ────────────────────────────
    // resetUserData
    // ────────────────────────────
    describe('resetUserData', () => {
        it('应该删除所有相关表的数据并返回 true', async () => {
            const result = await settingsService.resetUserData(1);

            expect(result).toBe(true);
            expect(mockTransaction).toHaveBeenCalledTimes(1);
        });

        it('应该在事务中删除所有用户数据表', async () => {
            await settingsService.resetUserData(1);

            // 验证调用了 6 次 delete（对应 6 个表）
            expect(mockDelete).toHaveBeenCalledTimes(6);
        });
    });
});