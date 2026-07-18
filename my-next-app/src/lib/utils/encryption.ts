import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 IV 长度为 12 字节
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 32;

/**
 * 加密字符串
 * @param text 待加密文本
 * @param secret 密钥（从环境变量读取）
 */
export function encrypt(text: string, secret: string): string {
    if (!secret) {
        throw new Error('Encryption secret is required');
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, 'sha512');
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    // 存储格式: salt (16) + iv (12) + tag (16) + encrypted
    return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

/**
 * 解密字符串
 * @param data base64 格式的加密数据
 * @param secret 密钥
 */
export function decrypt(data: string, secret: string): string {
    if (!secret) {
        throw new Error('Encryption secret is required');
    }

    try {
        const buffer = Buffer.from(data, 'base64');
        
        const salt = buffer.subarray(0, SALT_LENGTH);
        const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        
        const key = crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, 'sha512');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error('[Encryption] Decryption failed:', error);
        throw new Error('Failed to decrypt data');
    }
}
