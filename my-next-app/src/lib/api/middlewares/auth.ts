import { createMiddleware } from 'hono/factory'
import { jwt } from 'hono/jwt'
import { getCookie } from 'hono/cookie'
import { COOKIE_NAME } from '@/lib/auth/auth-edge'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only-replace-it-in-production'

export const authMiddleware = createMiddleware(async (c, next) => {
    // 优先检查 Authorization Header
    const authHeader = c.req.header('Authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const jwtMiddleware = jwt({
            secret: JWT_SECRET,
            alg: 'HS256'
        })
        return jwtMiddleware(c, next)
    }

    // 次选检查 Cookie (供 Web Frontend 直接调用 /api 时使用)
    const token = getCookie(c, COOKIE_NAME)
    if (token) {
        // Hono jwt 默认从 header 获取，这里需要手动注入或通过 jwt 选项指定
        // 我们通过 cookie 提取后直接手动验证并设置 payload，或者利用 jwt 选项
        const jwtMiddleware = jwt({
            secret: JWT_SECRET,
            alg: 'HS256',
            cookie: COOKIE_NAME
        })
        return jwtMiddleware(c, next)
    }

    return c.json({ error: 'Unauthorized: No token provided' }, 401)
})

export const getCurrentUser = (c: any) => {
    const payload = c.get('jwtPayload')
    if (!payload) return null
    // Compatible with both { sub: id } and { user: { id: ... } }
    return payload.user || payload
}
