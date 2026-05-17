// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../encryption';

describe('Encryption Utils', () => {
    const secret = 'test-secret-key-12345';

    describe('encrypt', () => {
        it('应该加密字符串', () => {
            const result = encrypt('Hello World', secret);
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('应该返回 base64 编码', () => {
            const result = encrypt('Test', secret);
            expect(result).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
            expect(result.length % 4).toBe(0);
            expect(decrypt(result, secret)).toBe('Test');
        });

        it('应该抛出错误当没有密钥', () => {
            expect(() => encrypt('test', '')).toThrow('Encryption secret is required');
        });

        it('应该对相同输入产生不同输出（随机 salt/iv）', () => {
            const result1 = encrypt('Same Text', secret);
            const result2 = encrypt('Same Text', secret);
            expect(result1).not.toBe(result2);
        });
    });

    describe('decrypt', () => {
        it('应该解密之前加密的文本', () => {
            const original = 'Hello World';
            const encrypted = encrypt(original, secret);
            const decrypted = decrypt(encrypted, secret);
            expect(decrypted).toBe(original);
        });

        it('应该解密包含特殊字符的文本', () => {
            const original = '你好世界！@#$%^&*()';
            const encrypted = encrypt(original, secret);
            const decrypted = decrypt(encrypted, secret);
            expect(decrypted).toBe(original);
        });

        it('应该处理长文本', () => {
            const original = 'A'.repeat(1000);
            const encrypted = encrypt(original, secret);
            const decrypted = decrypt(encrypted, secret);
            expect(decrypted).toBe(original);
        });

        it('应该抛出错误当密钥错误', () => {
            const encrypted = encrypt('test', secret);
            expect(() => decrypt(encrypted, 'wrong-key')).toThrow();
        });

        it('应该抛出错误当没有密钥', () => {
            const encrypted = encrypt('test', secret);
            expect(() => decrypt(encrypted, '')).toThrow('Encryption secret is required');
        });

        it('应该抛出错误当数据损坏', () => {
            const encrypted = encrypt('test', secret);
            const corrupted = encrypted.slice(0, -5) + 'xxxxx';
            expect(() => decrypt(corrupted, secret)).toThrow();
        });
    });

    describe('roundtrip', () => {
        it('应该正确处理各种文本', () => {
            const testCases = [
                'simple text',
                '中文内容',
                '1234567890',
                '!@#$%^&*()',
                '',
                'a'.repeat(10000)
            ];

            testCases.forEach(text => {
                const encrypted = encrypt(text, secret);
                const decrypted = decrypt(encrypted, secret);
                expect(decrypted).toBe(text);
            });
        });
    });
});
