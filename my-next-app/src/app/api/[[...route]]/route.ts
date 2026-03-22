import { OpenAPIHono } from '@hono/zod-openapi'
import { handle } from 'hono/vercel'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'

export const runtime = 'nodejs'

const app = new OpenAPIHono().basePath('/api')

// 开启跨域 (CORS) 支持，主要用于解决 Flutter Web 在 localhost 调试时的安全拦截
app.use('*', cors({
  origin: (origin) => origin, // 允许所有来源（仅限开发/受控环境）
  credentials: true,
}))

// 注册 Swagger UI
app.get('/doc', swaggerUI({ url: '/api/openapi.json' }))

// 注册 OpenAPI 文档端点
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'AI Learning Mobile API',
    description: 'API for AI Learning Mobile App',
  },
})

// 统一的 auth 路由 (具备 rate limiting & token generator)
import authRoute from '@/lib/api/routes/auth'
app.route('/auth', authRoute)

import questionsRoute from '@/lib/api/routes/questions'
app.route('/questions', questionsRoute)

import practiceRoute from '@/lib/api/routes/practice'
app.route('/practice', practiceRoute)

import historyRoute from '@/lib/api/routes/history'
app.route('/history', historyRoute)

import knowledgeRoute from '@/lib/api/routes/knowledge'
app.route('/knowledge', knowledgeRoute)

import masteryRoute from '@/lib/api/routes/mastery'
app.route('/mastery', masteryRoute)

import wrongBookRoute from '@/lib/api/routes/wrong-book'
app.route('/wrong-book', wrongBookRoute)

// 外部开放接口（题库暴露，独立鉴权，不走用户登录体系）
import externalRoute from '@/lib/api/routes/external'
app.route('/external', externalRoute)
// 管理员专属接口
import { adminRoute } from '@/lib/api/routes/admin'
app.route('/admin', adminRoute)

import textbookRoute from '@/lib/api/routes/textbook'
app.route('/textbook', textbookRoute)

import annotationsRoute from '@/lib/api/routes/annotations'
app.route('/annotations', annotationsRoute)

import chatRoute from '@/lib/api/routes/chat'
app.route('/chat', chatRoute)

import generateRoute from '@/lib/api/routes/generate'
app.route('/generate', generateRoute)





// Hello World 路由 (用于验证)
app.get('/hello', (c) => {
  return c.json({
    message: 'Hello from Hono!',
  })
})

import { authMiddleware, getCurrentUser } from '@/lib/api/middlewares/auth'

app.get('/me', authMiddleware, (c) => {
  const user = getCurrentUser(c)
  return c.json({ user })
})


export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
export const PATCH = handle(app)
export const OPTIONS = handle(app)
