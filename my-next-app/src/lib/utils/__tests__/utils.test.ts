import { describe, it, expect } from 'vitest';
import { cn, formatDuration, indexToLetter } from '../utils';

describe('cn（className 合并）', () => {
    it('应合并多个 className 字符串', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('应通过 tailwind-merge 去重冲突的 Tailwind 类', () => {
        // tailwind-merge 会用后面的替换前面的同类属性
        expect(cn('p-4', 'p-6')).toBe('p-6');
    });

    it('应过滤 falsy 值（undefined、false、null）', () => {
        expect(cn('foo', undefined, false, null as any, 'bar')).toBe('foo bar');
    });

    it('应支持条件类名对象语法', () => {
        expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500');
    });

    it('空输入应返回空字符串', () => {
        expect(cn()).toBe('');
    });
});

describe('formatDuration（毫秒格式化）', () => {
    it('0 毫秒应返回 "0秒"', () => {
        expect(formatDuration(0)).toBe('0秒');
    });

    it('999 毫秒应舍入为 "1秒"', () => {
        expect(formatDuration(999)).toBe('1秒');
    });

    it('1000 毫秒（1秒）应返回 "1秒"', () => {
        expect(formatDuration(1000)).toBe('1秒');
    });

    it('59000 毫秒（59秒）应返回 "59秒"', () => {
        expect(formatDuration(59000)).toBe('59秒');
    });

    it('60000 毫秒（整 1 分钟）应返回 "1分"', () => {
        expect(formatDuration(60000)).toBe('1分');
    });

    it('90000 毫秒（1分30秒）应返回 "1分30秒"', () => {
        expect(formatDuration(90000)).toBe('1分30秒');
    });

    it('3661000 毫秒（61分1秒）应正确格式化', () => {
        expect(formatDuration(3661000)).toBe('61分1秒');
    });

    it('120000 毫秒（2分钟整）应返回 "2分"', () => {
        expect(formatDuration(120000)).toBe('2分');
    });
});

describe('indexToLetter（索引转字母）', () => {
    it('索引 0 应返回 "A"', () => {
        expect(indexToLetter(0)).toBe('A');
    });

    it('索引 1 应返回 "B"', () => {
        expect(indexToLetter(1)).toBe('B');
    });

    it('索引 25 应返回 "Z"', () => {
        expect(indexToLetter(25)).toBe('Z');
    });

    it('索引 4 应返回 "E"', () => {
        expect(indexToLetter(4)).toBe('E');
    });

    it('负数索引应返回数字字符串', () => {
        expect(indexToLetter(-1)).toBe('-1');
    });

    it('超出范围的索引 26 应返回数字字符串', () => {
        expect(indexToLetter(26)).toBe('26');
    });
});
