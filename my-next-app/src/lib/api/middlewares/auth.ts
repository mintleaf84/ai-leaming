import { createMiddleware } from 'hono/factory'
import { jwt } from 'hono/jwt'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only-replace-it-in-production'

export const authMiddleware = createMiddleware(async (c, next) => {
    const jwtMiddleware = jwt({
        secret: JWT_SECRET,
        alg: 'HS256'
    })
    return jwtMiddleware(c, next)
})

export const getCurrentUser = (c: any) => {
    const payload = c.get('jwtPayload')
    if (!payload) return null
    // Compatible with both { sub: id } and { user: { id: ... } }
    return payload.user || payload
}
