// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getErrorMessage, isSqliteConstraintError } from '../error';

describe('Error Utils', () => {
    describe('getErrorMessage', () => {
        it('应该从 Error 对象提取消息', () => {
            const error = new Error('Something went wrong');
            expect(getErrorMessage(error)).toBe('Something went wrong');
        });

        it('应该处理空消息的 Error', () => {
            const error = new Error('');
            expect(getErrorMessage(error)).toBe('未知错误');
        });

        it('应该处理字符串错误', () => {
            expect(getErrorMessage('String error')).toBe('String error');
        });

        it('应该处理空字符串', () => {
            expect(getErrorMessage('')).toBe('未知错误');
        });

        it('应该处理 null', () => {
            expect(getErrorMessage(null)).toBe('未知错误');
        });

        it('应该处理 undefined', () => {
            expect(getErrorMessage(undefined)).toBe('未知错误');
        });

        it('应该处理对象', () => {
            expect(getErrorMessage({ code: 500 })).toBe('未知错误');
        });

        it('应该使用自定义 fallback', () => {
            const error = new Error('');
            expect(getErrorMessage(error, 'Custom error')).toBe('Custom error');
        });

        it('应该处理数字错误', () => {
            expect(getErrorMessage(404)).toBe('未知错误');
        });
    });

    describe('isSqliteConstraintError', () => {
        it('应该识别匹配的 SQLite 错误码', () => {
            const error = new Error('UNIQUE constraint failed') as Error & { code?: string };
            error.code = 'SQLITE_CONSTRAINT_UNIQUE';
            expect(isSqliteConstraintError(error, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(true);
        });

        it('应该拒绝不匹配的错误码', () => {
            const error = new Error('Some error') as Error & { code?: string };
            error.code = 'SQLITE_CONSTRAINT_UNIQUE';
            expect(isSqliteConstraintError(error, 'SQLITE_CONSTRAINT_CHECK')).toBe(false);
        });

        it('应该处理没有 code 属性的 Error', () => {
            const error = new Error('Some error');
            expect(isSqliteConstraintError(error, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
        });

        it('应该处理 null', () => {
            expect(isSqliteConstraintError(null, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
        });

        it('应该处理 undefined', () => {
            expect(isSqliteConstraintError(undefined, 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
        });

        it('应该处理字符串错误', () => {
            expect(isSqliteConstraintError('Some error', 'SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
        });
    });
});