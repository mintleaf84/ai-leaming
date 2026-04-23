import { describe, it, expect } from 'vitest';
import { getErrorMessage, isSqliteConstraintError } from '../error';

describe('getErrorMessage', () => {
    it('Error 实例应返回其 message', () => {
        const err = new Error('测试错误');
        expect(getErrorMessage(err)).toBe('测试错误');
    });

    it('字符串类型错误应原样返回', () => {
        expect(getErrorMessage('字符串错误')).toBe('字符串错误');
    });

    it('非 Error/字符串类型应返回默认 fallback', () => {
        expect(getErrorMessage(42)).toBe('未知错误');
        expect(getErrorMessage(null)).toBe('未知错误');
        expect(getErrorMessage(undefined)).toBe('未知错误');
        expect(getErrorMessage({ code: 'ERR' })).toBe('未知错误');
    });

    it('自定义 fallback 应在无法提取消息时返回', () => {
        expect(getErrorMessage(null, '自定义默认')).toBe('自定义默认');
        expect(getErrorMessage(undefined, '自定义默认')).toBe('自定义默认');
    });

    it('Error.message 为空字符串时应返回 fallback', () => {
        const err = new Error('');
        expect(getErrorMessage(err)).toBe('未知错误');
    });

    it('空字符串类型错误应返回 fallback', () => {
        expect(getErrorMessage('')).toBe('未知错误');
    });
});

describe('isSqliteConstraintError', () => {
    it('带有匹配 code 的 Error 应返回 true', () => {
        const err = Object.assign(new Error('UNIQUE constraint failed'), {
            code: 'SQLITE_CONSTRAINT_UNIQUE',
        });
        expect(isSqliteConstraintError(err, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(true);
    });

    it('code 不匹配时应返回 false', () => {
        const err = Object.assign(new Error('Other error'), {
            code: 'SQLITE_CONSTRAINT_NOTNULL',
        });
        expect(isSqliteConstraintError(err, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
    });

    it('非 Error 类型应返回 false', () => {
        expect(isSqliteConstraintError('字符串', 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
        expect(isSqliteConstraintError(42, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
        expect(isSqliteConstraintError(null, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
        expect(isSqliteConstraintError(undefined, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
    });

    it('没有 code 属性的 Error 应返回 false', () => {
        const err = new Error('普通错误');
        expect(isSqliteConstraintError(err, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
    });
});
