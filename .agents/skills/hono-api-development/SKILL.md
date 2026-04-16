---
name: hono-api-development
description: 在 Next.js 项目中开发 Hono API (REST) 的官方规范与代码模板。当你需要为移动端或前端编写新的后端接口（尤其是非 Server Actions 调用的独立 API），或者需要理解现有的鉴权、路由映射机制时使用。
---

# Hono API Development Guide

本项目中的 REST API 没有使用 Next.js 的原生 App Router (`src/app/api/xxx/route.ts`)，而是统一通过单一的 catch-all 路由委托给 **Hono (`@hono/zod-openapi`)** 处理。这种设计能自动生成 Swagger UI，并在不同环境保持出色的性能。

## 🎯 绝对禁忌

> [!CAUTION]
> 绝对不要在 `src/app/api/` 的子目录下创建新的 `route.ts` 文件。
> 所有 API 请求都会通过 `src/app/api/[[...route]]/route.ts` 这个入口统一分发到 Hono 实例。

## 🛠️ 创建新 API 的标准三步曲

### 1. 创建路由定义文件

在 `src/lib/api/routes/` 目录下创建你的功能文件，例如 `book.ts`：

```typescript
// src/lib/api/routes/book.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

const app = new OpenAPIHono()

// 定义响应 Schema (必须)
const BookResponseSchema = z.object({
    id: z.string(),
    title: z.string(),
    author: z.string(),
})

// 创建 Route 定义
const getBookRoute = createRoute({
    method: 'get',
    path: '/:id',
    request: {
        params: z.object({
            id: z.string().describe('Book ID')
        })
    },
    responses: {
        200: {
            content: { 'application/json': { schema: BookResponseSchema } },
            description: 'Get book details'
        },
        404: {
            description: 'Book not found'
        }
    }
})

// 实现处理逻辑
app.openapi(getBookRoute, async (c) => {
    const { id } = c.req.valid('param')
    
    // 调用 service 层的逻辑获取数据...
    const book = { id, title: 'Example', author: 'AI' }
    
    if (!book) return c.json({ error: 'Not found' }, 404)
    return c.json(book, 200)
})

export default app
```

### 2. 将路由挂载到主入口

打开 `src/app/api/[[...route]]/route.ts` 并在适当的位置导入、挂载：

```typescript
// 1. 寻找其他 route 注册的地方
import bookRoute from '@/lib/api/routes/book'

// 2. 挂载 (最终路径将变为 /api/book/...)
app.route('/book', bookRoute)
```

### 3. (仅移动端需要) 在 Dart 端更新 ApiClient

前往 `mobile_app/lib/shared/datasources/api_client.dart`：

```dart
@GET('/book/{id}')
Future<BookResponse> getBook(@Path('id') String id);
```

*(记住别忘了跑 `flutter pub run build_runner build --delete-conflicting-outputs` 如果改了 Retrofit 类)*

## 🛡️ 限流与 Middleware

全局限流逻辑（防暴力破解等）已经以 Hono 中间件的形式实现在了 `src/lib/api/routes/auth.ts` 中。
如果你的新接口需要特定限流，请修改 `src/lib/rate-limit.ts` 中的 `RATE_LIMIT_CONFIG`。
