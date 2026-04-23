// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Mock dependencies
vi.mock('@/lib/db', () => ({
    db: {
        prepare: vi.fn().mockReturnValue({
            get: vi.fn(),
            run: vi.fn()
        })
    }
}));

vi.mock('@/lib/logger', () => ({
    default: {
        error: vi.fn(),
        info: vi.fn()
    }
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn()
}));

import { getGlobalFeatureFlag, toggleGlobalFeatureFlag } from '../feature-flags';
import { db } from '@/lib/db';

describe('Feature Flags Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getGlobalFeatureFlag', () => {
        it('应返回数据库中的开关值 (true)', async () => {
            const mockGet = vi.fn().mockReturnValue({ value: 'true' });
            vi.mocked(db.prepare).mockReturnValue({ get: mockGet } as any);

            const result = await getGlobalFeatureFlag('TEST_FLAG', false);

            expect(result).toBe(true);
            expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT value FROM system_settings'));
            expect(mockGet).toHaveBeenCalledWith(0, 'TEST_FLAG');
        });

        it('应返回数据库中的开关值 (false)', async () => {
            const mockGet = vi.fn().mockReturnValue({ value: 'false' });
            vi.mocked(db.prepare).mockReturnValue({ get: mockGet } as any);

            const result = await getGlobalFeatureFlag('TEST_FLAG', true);

            expect(result).toBe(false);
        });

        it('如果数据库中没有记录，应返回默认值', async () => {
            const mockGet = vi.fn().mockReturnValue(undefined);
            vi.mocked(db.prepare).mockReturnValue({ get: mockGet } as any);

            const result = await getGlobalFeatureFlag('MISSING_FLAG', true);

            expect(result).toBe(true);
        });

        it('如果发生数据库错误，应返回默认值', async () => {
            vi.mocked(db.prepare).mockImplementation(() => {
                throw new Error('DB Error');
            });

            const result = await getGlobalFeatureFlag('ERROR_FLAG', false);

            expect(result).toBe(false);
        });
    });

    describe('toggleGlobalFeatureFlag', () => {
        it('应成功更新开关状态并返回 success', async () => {
            const mockRun = vi.fn().mockReturnValue({ changes: 1 });
            vi.mocked(db.prepare).mockReturnValue({ run: mockRun } as any);

            const result = await toggleGlobalFeatureFlag('TEST_FLAG', true);

            expect(result.success).toBe(true);
            expect(result.value).toBe(true);
            expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO system_settings'));
            expect(mockRun).toHaveBeenCalledWith(0, 'TEST_FLAG', 'true');
        });

        it('更新失败时应返回错误信息', async () => {
            vi.mocked(db.prepare).mockImplementation(() => {
                throw new Error('Write Error');
            });

            const result = await toggleGlobalFeatureFlag('FAIL_FLAG', false);

            expect(result.success).toBe(false);
            expect(result.error).toBe('数据库更新开关失败');
        });
    });
});
