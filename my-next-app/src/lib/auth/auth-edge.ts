/**
 * Edge Runtime 兼容的认证模块
 * 仅包含不依赖 Node.js 原生模块的 JWT 操作
 * 供 middleware.ts 使用
 */
import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'fallback-secret-for-development-only-replace-it-in-production'
);

export const COOKIE_NAME = 'auth_token';

/**
 * 加密 JWT payload
 */
export async function encrypt(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(SECRET);
}

/**
 * 解密 JWT token
 */
export async function decrypt(input: string): Promise<any> {
    const { payload } = await jwtVerify(input, SECRET, {
        algorithms: ['HS256'],
    });
    return payload;
}
