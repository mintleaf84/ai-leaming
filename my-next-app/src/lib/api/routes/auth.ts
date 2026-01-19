import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { authService } from '@/lib/services/auth'
import { sign } from 'hono/jwt'

const app = new OpenAPIHono()

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
        }
    }
})

app.openapi(loginRoute, async (c) => {
    const { username, password } = c.req.valid('json')

    const user = await authService.validateCredentials(username, password)
    if (!user) {
        return c.json({ error: 'Invalid credentials' }, 401)
    }

    const token = await sign({
        user: user,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
    }, JWT_SECRET)

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

        return c.json({
            token,
            user
        })
    } catch (e: any) {
        return c.json({ error: e.message || 'Registration failed' }, 400)
    }
})

export default app
