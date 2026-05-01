import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { authService } from '@/lib/services/auth'
import { setCookie, deleteCookie } from 'hono/cookie'
import { logger as honoLogger } from 'hono/logger'
import { checkRateLimit, getClientIP } from '@/lib/auth/rate-limit'
import { COOKIE_NAME, encrypt } from '@/lib/auth/auth-edge'

const app = new OpenAPIHono()

// 注入日志
app.use('*', honoLogger())

// Rate Limiting 中间件
app.use('*', async (c, next) => {
    // 构建标准的 fetch API Request 对象以符合 getClientIP 签名
    const reqInfo = { headers: c.req.raw.headers } as unknown;
    const clientIP = getClientIP(reqInfo as unknown as Parameters<typeof getClientIP>[0]);

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

// 移除冗余的 JWT_SECRET，改为统一使用 auth-edge 内部的配置

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
        return c.json({ error: '用户名或密码不正确' }, 401)
    }

    // 使用统一的 encrypt 方法确保与 middleware 兼容
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const token = await encrypt({
        user: user,
        expires,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days (keep exp for standard tools)
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

        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        const token = await encrypt({
            user: user,
            expires,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
        })

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
    } catch (e: unknown) {
        return c.json({ error: (e instanceof Error ? e.message : null) || '注册失败' }, 400)
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
