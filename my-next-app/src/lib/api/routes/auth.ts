import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { authService } from '@/lib/services/auth'
import { sign } from 'hono/jwt'
import { setCookie, deleteCookie } from 'hono/cookie'
import { logger as honoLogger } from 'hono/logger'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { COOKIE_NAME } from '@/lib/auth/auth-edge'

const app = new OpenAPIHono()

// 注入日志
app.use('*', honoLogger())

// Rate Limiting 中间件
app.use('*', async (c, next) => {
    // 构建标准的 fetch API Request 对象以符合 getClientIP 签名
    const reqInfo = { headers: c.req.raw.headers } as any;
    const clientIP = getClientIP(reqInfo);

    // 我们在 /api 挂载点下，原始路径 c.req.path 可能是 /api/auth/login。
    // 但是这里中间件获取的可能是 /login。这里兼容一下：
    const routePath = `/api/auth${c.req.path}`;
    const rateLimitResult = checkRateLimit(clientIP, routePath);

    if (!rateLimitResult.success) {
        c.header('X-RateLimit-Limit', String(rateLimitResult.limit));
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', String(Math.ceil(rateLimitResult.resetTime / 1000)));
        c.header('Retry-After', String(Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)));

        return c.json({ error: '请求过于频繁，请稍后再试' }, 429);
    }

    await next();
})

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development-only-replace-it-in-production'

const LoginSchema = z.object({
    username: z.string(),
    password: z.string()
})

const LoginResponseSchema = z.object({
    token: z.string(),
    user: z.object({
        id: z.number(),
        username: z.string(),
        role: z.string()
    })
})

const loginRoute = createRoute({
    method: 'post',
    path: '/login',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: LoginSchema
                }
            }
        }
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: LoginResponseSchema
                }
            },
            description: 'Login successful'
        },
        401: {
            description: 'Invalid credentials'
        },
        429: {
            description: 'Too Many Requests'
        }
    }
})

app.openapi(loginRoute, async (c) => {
    const { username, password } = c.req.valid('json')

    const user = await authService.validateCredentials(username, password)
    if (!user) {
        return c.json({ error: 'Invalid credentials' }, 401)
    }

    // 使用统一的 encrypt 方法确保与 middleware 兼容
    const { encrypt } = await import('@/lib/auth/auth-edge')
    const token = await encrypt({
        user: user,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
    })

    console.log(`[Auth API] Login success for ${username}, token generated`);

    // 设置 Cookie
    setCookie(c, COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 7, // 7 days
        sameSite: 'Lax',
    })

    return c.json({
        token,
        user
    })
})


const RegisterSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6)
})

const registerRoute = createRoute({
    method: 'post',
    path: '/register',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: RegisterSchema
                }
            }
        }
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: LoginResponseSchema
                }
            },
            description: 'Registration successful'
        },
        400: {
            description: 'Username already exists or invalid input'
        },
        429: {
            description: 'Too Many Requests'
        }
    }
})

app.openapi(registerRoute, async (c) => {
    const { username, password } = c.req.valid('json')

    try {
        const user = await authService.register(username, password)

        const token = await sign({
            user: user,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
        }, JWT_SECRET)

        // 设置 Cookie
        setCookie(c, COOKIE_NAME, token, {
            path: '/',
            httpOnly: true,
            maxAge: 60 * 60 * 24 * 7, // 7 days
            sameSite: 'Lax',
        })

        return c.json({
            token,
            user
        })
    } catch (e: any) {
        return c.json({ error: e.message || 'Registration failed' }, 400)
    }
})

const logoutRoute = createRoute({
    method: 'post',
    path: '/logout',
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: z.object({ success: z.boolean() })
                }
            },
            description: 'Logout successful'
        }
    }
})

app.openapi(logoutRoute, async (c) => {
    deleteCookie(c, COOKIE_NAME, {
        path: '/',
    })
    return c.json({ success: true })
})

export default app
