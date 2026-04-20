/**
 * Edge Runtime 兼容的认证模块
 * 仅包含不依赖 Node.js 原生模块的 JWT 操作
 * 供 middleware.ts 使用
 */
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET_ENV = process.env.JWT_SECRET;
const SECRET = new TextEncoder().encode(
    JWT_SECRET_ENV || 'fallback-secret-for-development-only'
);

export const COOKIE_NAME = 'auth_token';

/**
 * 加密 JWT payload
 */
export async function encrypt(payload: unknown) {
    if (!JWT_SECRET_ENV && process.env.NODE_ENV === 'production') {
        throw new Error('系统安全配置严重错误：生产环境缺少 JWT_SECRET，为防止伪造凭证已拒绝签发 Token！');
    }
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(SECRET);
}

/**
 * 解密 JWT token
 */
export async function decrypt(input: string): Promise<unknown> {
    if (!JWT_SECRET_ENV && process.env.NODE_ENV === 'production') {
        throw new Error('系统安全配置严重错误：生产环境缺少 JWT_SECRET，无法安全地验证 Token！');
    }
    const { payload } = await jwtVerify(input, SECRET, {
        algorithms: ['HS256'],
    });
    return payload;
}
