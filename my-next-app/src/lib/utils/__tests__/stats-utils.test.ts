// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { calculateStreakFromDates } from '../stats-utils';

describe('Stats Utils', () => {
    describe('calculateStreakFromDates', () => {
        it('应该计算连续学习天数（包含今天）', () => {
            const dates = ['2025-06-15', '2025-06-14', '2025-06-13'];
            const result = calculateStreakFromDates(dates, '2025-06-15', '2025-06-14');
            expect(result).toBe(3);
        });

        it('应该计算连续学习天数（昨天开始）', () => {
            const dates = ['2025-06-14', '2025-06-13', '2025-06-12'];
            const result = calculateStreakFromDates(dates, '2025-06-15', '2025-06-14');
            expect(result).toBe(3);
        });

        it('应该返回 1 当只有今天有练习', () => {
            const dates = ['2025-06-15'];
            const result = calculateStreakFromDates(dates, '2025-06-15', '2025-06-14');
            expect(result).toBe(1);
        });

        it('应该返回 0 当最近练习比昨天还早', () => {
            const dates = ['2025-06-10'];
            const result = calculateStreakFromDates(dates, '2025-06-15', '2025-06-14');
            expect(result).toBe(0);
        });

        it('应该处理空数组', () => {
            const dates: string[] = [];
            const result = calculateStreakFromDates(dates, '2025-06-15', '2025-06-14');
            expect(result).toBe(0);
        });

        it('应该处理有间断的练习', () => {
            const dates = ['2025-06-15', '2025-06-13', '2025-06-12'];
            const result = calculateStreakFromDates(dates, '2025-06-15', '2025-06-14');
            expect(result).toBe(1);
        });

        it('应该处理多天但有间断', () => {
            const dates = ['2025-06-15', '2025-06-14', '2025-06-12', '2025-06-11'];
            const result = calculateStreakFromDates(dates, '2025-06-15', '2025-06-14');
            expect(result).toBe(2);
        });
    });
});
