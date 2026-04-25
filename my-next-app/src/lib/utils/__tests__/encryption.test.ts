import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../encryption';

describe('Encryption Utils', () => {
    const secret = 'test-secret-key-at-least-32-chars-long';
    const plainText = 'Hello WebDAV Password 123!';

    it('should encrypt and decrypt a string correctly', () => {
        const encrypted = encrypt(plainText, secret);
        expect(encrypted).not.toBe(plainText);
        
        const decrypted = decrypt(encrypted, secret);
        expect(decrypted).toBe(plainText);
    });

    it('should throw error if secret is missing', () => {
        expect(() => encrypt(plainText, '')).toThrow('Encryption secret is required');
        expect(() => decrypt('some-data', '')).toThrow('Encryption secret is required');
    });

    it('should fail to decrypt with wrong secret', () => {
        const encrypted = encrypt(plainText, secret);
        expect(() => decrypt(encrypted, 'wrong-secret')).toThrow();
    });

    it('should produce different ciphertexts for the same plaintext (IV randomness)', () => {
        const encrypted1 = encrypt(plainText, secret);
        const encrypted2 = encrypt(plainText, secret);
        expect(encrypted1).not.toBe(encrypted2);
    });
});
