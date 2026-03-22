// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. 使用 BetterDbMock 增强 Mock 机制
const { mockBetterDb } = await vi.hoisted(async () => {
    const { createBetterDbMock } = await import('../../__tests__/db-mock-utils');
    return {
        mockBetterDb: createBetterDbMock()
    };
});

vi.mock('@/lib/db', () => ({ default: mockBetterDb }));

import { schedulingService, calculateSessionRatios } from '../scheduling';

describe('Scheduling Service (Enhanced Mock)', () => {
    beforeEach(() => {
        mockBetterDb.reset();
        vi.clearAllMocks();
    });

    describe('calculateSessionRatios', () => {
        it('应该按照 40/40/20 比例正确计算题目数量', () => {
            // 10 题：4 重难、4 生疏、2 常规
            expect(calculateSessionRatios(10)).toEqual({ stubborn: 4, blind: 4, regular: 2 });
            // 35 题：14 重难、14 生疏、7 常规
            expect(calculateSessionRatios(35)).toEqual({ stubborn: 14, blind: 14, regular: 7 });
            // 1 题：由于 Math.floor，前两项为 0，最后一项补齐
            expect(calculateSessionRatios(1)).toEqual({ stubborn: 0, blind: 0, regular: 1 });
        });
    });

    describe('generateSession', () => {
        it('应该执行正确逻辑的 SQL 并生成题目 Session', () => {
            // 设置 Mock 返回数据
            mockBetterDb._mockAll.mockImplementation(() => {
                const sql = mockBetterDb.getLastSqlCall().sql.toLowerCase();
                // 根据 SQL 关键字返回不同类型的“题目”
                if (sql.includes('observation_zone')) return [{ id: 1, content: 'Stubborn' }];
                if (sql.includes('not exists')) return [{ id: 2, content: 'Blind' }];
                return [{ id: 3, content: 'Regular' }];
            });

            const session = schedulingService.generateSession(10);

            // 1. 验证 SQL 逻辑是否覆盖了三个核心维度
            const calls = mockBetterDb._state.calls;
            
            // 验证重难点逻辑 (利用了 observation_zone)
            expect(calls.some((c: { sql: string }) => c.sql.toLowerCase().includes('observation_zone'))).toBe(true);
            
            // 验证生疏逻辑 (排除了已练习的 practice_logs)
            expect(calls.some((c: { sql: string }) => c.sql.toLowerCase().includes('not exists') && c.sql.toLowerCase().includes('practice_logs'))).toBe(true);
            
            // 验证常规逻辑 (排除了已选出的题目 ID)
            expect(calls.some((c: { sql: string }) => c.sql.toLowerCase().includes('not in'))).toBe(true);

            // 3. 验证结果包含所有类型的题目
            expect(session.map(s => s.id)).toContain(1);
            expect(session.map(s => s.id)).toContain(2);
            expect(session.map(s => s.id)).toContain(3);
        });

        it('应该在 Regular 查询中正确构建 NOT IN 排除列表', () => {
            let capturedSql = '';
            mockBetterDb._mockAll.mockImplementation(() => {
                const call = mockBetterDb.getLastSqlCall();
                if (call.sql.toLowerCase().includes('observation_zone')) return [{ id: 501 }];
                if (call.sql.toLowerCase().includes('not exists')) return [{ id: 502 }];
                if (call.sql.toLowerCase().includes('not in')) {
                    capturedSql = call.sql;
                    return [{ id: 503 }];
                }
                return [];
            });

            schedulingService.generateSession(20);
            
            // 核心验证：第三次查询（Regular）必须排除掉前两次查询选中的 ID (501, 502)
            expect(capturedSql).toContain('501,502');
        });
    });
});
