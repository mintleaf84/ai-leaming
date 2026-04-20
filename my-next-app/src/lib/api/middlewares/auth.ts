import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { _decode, verify } from 'hono/jwt'
import { COOKIE_NAME } from '@/lib/auth/auth-edge'
import { getUserById } from '@/lib/auth/user-service'

// 安全加固：生产环境建议配置 JWT_SECRET
// 移除文件顶层 throw，避免阻塞 Next.js 构建过程
const JWT_SECRET = process.env.JWT_SECRET;
const SAFE_SECRET = JWT_SECRET || 'fallback-secret-for-development-only';

import { Context } from 'hono'
import { User } from '@/lib/auth/user-service'

// --- 鉴权内存缓存机制 ---
interface CachedUser {
    exists: boolean;
    token_version?: number;
    expiresAt: number;
}
const authCache = new Map<number, CachedUser>();
const CACHE_TTL_MS = 60 * 1000; // 60秒过期

// ... (existing code)

export const authMiddleware = createMiddleware(async (c, next) => {
    // 强制运行时安全扫描：生产环境禁止缺乏密钥
    if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
        console.error('[SECURITY FATAL] 生产环境缺少 JWT_SECRET，拒绝所有鉴权请求');
        return c.json({ error: '系统配置错误：生产环境未配置 JWT 密钥，拒绝验证凭证' }, 500);
    }

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
        const userId = Number(user.id);
        const now = Date.now();

        // 使用内存缓存，减轻 SQLite 库并发压力，避免每路由强制 DB 读取
        let cached = authCache.get(userId);
        if (!cached || cached.expiresAt < now) {
            const dbUser = getUserById(userId);
            cached = {
                exists: !!dbUser,
                token_version: dbUser?.token_version,
                expiresAt: now + CACHE_TTL_MS
            };
            authCache.set(userId, cached);
            
            // 被动防重：如果体积过大，实施被动 GC
            if (authCache.size > 5000) {
                for (const [k, v] of authCache.entries()) {
                    if (v.expiresAt < now) authCache.delete(k);
                }
            }
        }

        if (!cached.exists) {
            return c.json({ error: 'Unauthorized: User no longer exists' }, 401);
        }

        // 检查版本号是否一致
        if (cached.token_version !== (user.token_version || 0)) {
            console.warn(`[Auth] Session revoked for user ${user.id} due to version mismatch`);
            return c.json({ error: 'Unauthorized: Session revoked' }, 401);
        }

        await next();
    } catch (err) {
        console.error('[Auth] Token verification failed:', err);
        return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);
    }
});

export const getCurrentUser = (c: Context): User => {
    const payload = c.get('jwtPayload') as { user?: User } | undefined
    // 由于此函数仅在 authMiddleware 保护的路由中调用，
    // payload 必然存在，因此安全地强制返回 User
    return (payload?.user || payload) as User
}
