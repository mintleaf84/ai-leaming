import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { decode, verify } from 'hono/jwt'
import { COOKIE_NAME } from '@/lib/auth/auth-edge'
import { getUserById } from '@/lib/auth/user-service'

// 安全加固：生产环境禁止使用回退密钥
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set in production!');
}
const SAFE_SECRET = JWT_SECRET || 'fallback-secret-for-development-only';

import { Context } from 'hono'
import { User } from '@/lib/auth/user-service'

// ... (existing code)

export const authMiddleware = createMiddleware(async (c, next) => {
    // 灵活支持 Header 或 Cookie
    const token = c.req.header('Authorization')?.replace('Bearer ', '') || getCookie(c, COOKIE_NAME);

    if (!token) {
        return c.json({ error: 'Unauthorized: No token provided' }, 401);
    }

    try {
        // 1. JWT 签名与过期校验
        const payload = await verify(token, SAFE_SECRET, 'HS256');
        c.set('jwtPayload', payload);

        // 2. 数据库状态校验 (核心加固：Session 撤销检查)
        // 显式断言或解构以获得更好的类型提示
        const user = (payload.user || payload) as User;
        
        if (!user || !user.id) {
            return c.json({ error: 'Unauthorized: Invalid payload' }, 401);
        }

        // 核心加固：确保 ID 为数字类型
        const dbUser = getUserById(Number(user.id));
        if (!dbUser) {
            return c.json({ error: 'Unauthorized: User no longer exists' }, 401);
        }

        // 检查版本号是否一致
        if (dbUser.token_version !== (user.token_version || 0)) {
            console.warn(`[Auth] Session revoked for user ${user.id} due to version mismatch`);
            return c.json({ error: 'Unauthorized: Session revoked' }, 401);
        }

        await next();
    } catch (err) {
        console.error('[Auth] Token verification failed:', err);
        return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);
    }
});

export const getCurrentUser = (c: Context): User | null => {
    const payload = c.get('jwtPayload')
    if (!payload) return null
    return (payload.user || payload) as User
}
