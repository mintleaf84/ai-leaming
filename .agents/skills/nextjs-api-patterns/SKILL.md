---
name: nextjs-api-patterns
description: Next.js API Route 常见陷阱与最佳实践。在开发 Next.js API Routes 时使用，避免常见错误如重复解析请求体、阻塞式异步操作等。
---

# Next.js API Route 常见陷阱与最佳实践

本技能总结了在开发 Next.js App Router API Routes 时的常见错误模式和优化方案。

---

## 陷阱 1：请求体只能解析一次

### ❌ 错误模式

```typescript
export async function POST(req: Request) {
  // 第一次解析
  const { messages, sessionId } = await req.json();

  // ... 中间有其他逻辑 ...

  // 第二次解析 - 永远失败！Body stream 已被消费
  const { enableRag, context } = await req.json().catch(() => ({}));
  // enableRag 和 context 永远是 undefined
}
```

### ✅ 正确模式

```typescript
export async function POST(req: Request) {
  // 一次解析所有需要的字段
  const { messages, sessionId, enableRag, context } = await req.json();

  // 现在所有字段都可用
}
```

### 原理

`Request.json()` 消费的是底层的 `ReadableStream`。一旦流被读取，就无法再次读取。如果需要多次访问 body，应该：

1. 一次解析所有字段（推荐）
2. 先克隆请求 `req.clone().json()`（不推荐，增加内存开销）

---

## 陷阱 2：阻塞式异步操作影响用户体验

### ❌ 错误模式

```typescript
// 用户必须等待标题生成完成才能继续
const title = await generateChatTitle(sessionId);
updateUI(title);
// 用户现在才能继续操作
```

### ✅ 正确模式：Fire-and-Forget

```typescript
// 主流程立即返回，标题生成在后台进行
setTimeout(async () => {
  try {
    const title = await generateChatTitle(sessionId);
    updateUI(title);
  } catch (e) {
    console.error("标题生成失败:", e);
  }
}, 100); // 延迟确保 UI 先响应

// 用户立即可以继续操作
```

### 适用场景

- 生成 AI 标题/摘要
- 发送分析事件
- 后台日志记录
- 数据预热/缓存刷新

---

## 陷阱 3：流式响应超时配置

### ❌ 错误模式

```typescript
// 未设置 maxDuration，默认 10 秒可能不够
export async function POST(req: Request) {
  const result = await longRunningAICall();
  return result.toTextStreamResponse();
}
```

### ✅ 正确模式

```typescript
// 显式设置足够的超时时间
export const maxDuration = 60; // 允许 60 秒

export async function POST(req: Request) {
  const result = await longRunningAICall();
  return result.toTextStreamResponse();
}
```

---

## 陷阱 4：错误处理返回格式不一致

### ❌ 错误模式

```typescript
// 有时返回 JSON，有时返回 plain text
if (error) {
  return new Response("Something went wrong", { status: 500 });
}
```

### ✅ 正确模式

```typescript
// 始终返回结构化的 JSON 错误
if (error) {
  return new Response(
    JSON.stringify({ error: error.message, code: "INTERNAL_ERROR" }),
    {
      status: 500,
      headers: { "Content-Type": "application/json" },
    },
  );
}
```

---

## 最佳实践清单

- [ ] 请求体只解析一次，提取所有需要的字段
- [ ] 非核心异步操作使用 fire-and-forget 模式
- [ ] 设置合理的 `maxDuration`（AI 调用建议 60 秒以上）
- [ ] 错误返回使用统一的 JSON 格式
- [ ] 流式响应使用 `toTextStreamResponse()` 而非手动构建
- [ ] 关键操作添加 try-catch 并记录日志
