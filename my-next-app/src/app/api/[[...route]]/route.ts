import { OpenAPIHono } from '@hono/zod-openapi'
import { handle } from 'hono/vercel'
import { swaggerUI } from '@hono/swagger-ui'

export const runtime = 'nodejs'

const app = new OpenAPIHono().basePath('/api/v1')

// 注册 Swagger UI
app.get('/doc', swaggerUI({ url: '/api/v1/openapi.json' }))

// 注册 OpenAPI 文档端点
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'AI Learning Mobile API',
    description: 'API for AI Learning Mobile App',
  },
})

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
