import { describe, it, expect } from 'vitest';
import { calculateStreakFromDates } from '../stats-utils';

describe('stats-utils: calculateStreakFromDates', () => {
  const today = '2024-01-15';
  const yesterday = '2024-01-14';

  it('如果没有练习记录，连续天数应为 0', () => {
    expect(calculateStreakFromDates([], today, yesterday)).toBe(0);
  });

  it('如果最后一次练习在今天之前（除了昨天），连续天数应为 0', () => {
    const dates = ['2024-01-13', '2024-01-12'];
    expect(calculateStreakFromDates(dates, today, yesterday)).toBe(0);
  });

  it('如果今天有练习且昨天有练习，应累计', () => {
    const dates = ['2024-01-15', '2024-01-14', '2024-01-13'];
    expect(calculateStreakFromDates(dates, today, yesterday)).toBe(3);
  });

  it('如果只有昨天有练习，应从昨天开始计算', () => {
    const dates = ['2024-01-14', '2024-01-13'];
    expect(calculateStreakFromDates(dates, today, yesterday)).toBe(2);
  });

  it('应该在日期断档处停止计数', () => {
    // 15 有，14 有，13 没，12 有
    const dates = ['2024-01-15', '2024-01-14', '2024-01-12'];
    expect(calculateStreakFromDates(dates, today, yesterday)).toBe(2);
  });

  it('应该正确处理跨月的情况', () => {
    // 假设今天是 2024-02-01
    const feb01 = '2024-02-01';
    const jan31 = '2024-01-31';
    const _jan30 = '2024-01-30';
    const dates = ['2024-02-01', '2024-01-31', '2024-01-30'];
    expect(calculateStreakFromDates(dates, feb01, jan31)).toBe(3);
  });

  it('应该正确处理跨年的情况', () => {
    // 假设今天是 2024-01-01
    const jan01 = '2024-01-01';
    const dec31 = '2023-12-31';
    const dates = ['2024-01-01', '2023-12-31'];
    expect(calculateStreakFromDates(dates, jan01, dec31)).toBe(2);
  });

  it('同一天有多条记录（虽然输入已去重）应该表现正常', () => {
    const dates = ['2024-01-15', '2024-01-15', '2024-01-14'];
    expect(calculateStreakFromDates(dates, today, yesterday)).toBe(2);
  });
});
