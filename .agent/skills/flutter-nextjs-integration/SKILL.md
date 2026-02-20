---
name: flutter-nextjs-integration
description: Flutter 移动端与 Next.js 后端联调的常见陷阱与最佳实践。适用于：(1) 编写 Next.js API Route 供 Flutter 调用，(2) Freezed/json_serializable 实体与后端弱类型 JSON 的映射问题，(3) Dio 流式响应处理，(4) Next.js 15 动态路由参数变更。在开发涉及 Flutter + Next.js 全栈联调的功能时使用。关键词: Freezed fromJson, JsonConverter, StringIdConverter, build_runner .g.dart generation, Dio ResponseType.stream, Accept-Encoding identity, SSE streaming, async params await Next.js 15.
---

# Flutter ↔ Next.js 全栈联调避坑指南

本技能总结了 Flutter 移动端对接 Next.js 后端时反复踩过的高频陷阱，覆盖 API 设计、数据序列化、流式传输三大领域。

## 1. Next.js 15 动态路由参数必须 `await`

Next.js 15 中，Route Handler 的 `params` 变为 **异步 Promise**，直接访问 `params.id` 会得到 `undefined`，导致 `parseInt` 返回 `NaN`，最终返回 400。

```typescript
// ❌ 旧写法 (Next.js 14)
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10); // NaN!
}

// ✅ 新写法 (Next.js 15)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
}
```

> **触发场景**：任何 `[id]`、`[slug]` 等动态路由段的 Route Handler。

## 2. Freezed 实体的 `fromJson` 不可随意重写

Freezed 搭配 `json_serializable` 时，`factory Foo.fromJson(Map<String, dynamic> json) => _$FooFromJson(json);` 是**生成器的锚点**。如果改为自定义函数体（如添加类型转换逻辑），`build_runner` 会跳过 `.g.dart` 的生成，导致 `_$FooFromJson` 未定义。

**正确做法**：使用 `JsonConverter` 注解在字段级别处理类型不一致。

```dart
// ✅ 自定义 Converter 处理后端的 int id → String
class StringIdConverter implements JsonConverter<String, dynamic> {
  const StringIdConverter();
  @override
  String fromJson(dynamic json) => json.toString();
  @override
  dynamic toJson(String object) => object;
}

@freezed
abstract class ChatMessage with _$ChatMessage {
  const factory ChatMessage({
    @StringIdConverter() required String id,  // 后端返回 int 3，自动转为 "3"
    required String role,
    required String content,
  }) = _ChatMessage;

  // ✅ 必须保持简单的箭头代理形式
  factory ChatMessage.fromJson(Map<String, dynamic> json) =>
      _$ChatMessageFromJson(json);
}
```

## 3. 后端弱类型字段的常见映射陷阱

| 后端字段 | 后端实际类型 | Flutter 期望类型 | 解决方案 |
|---------|------------|----------------|---------|
| `id` | `int` | `String` | `@StringIdConverter()` |
| `is_favorite` | `int` (0/1) | `bool` | `@JsonKey(name: 'is_favorite', fromJson: _boolFromInt)` |
| `created_at` | `String` | `DateTime` | `@JsonKey(fromJson: DateTime.parse)` |

辅助函数：

```dart
bool _boolFromInt(dynamic value) {
  if (value is int) return value == 1;
  if (value is bool) return value;
  return false;
}
```

> **注意**：`@JsonKey` 放在 Freezed 构造函数参数上时，`@Default()` 要写在前面：`@Default(false) @JsonKey(...) bool isFavorite`

## 4. Dio 流式响应配置要点

Flutter 端通过 Dio 消费后端的 SSE/流式输出时：

```dart
final response = await dio.post('/chat',
  data: payload,
  options: Options(
    responseType: ResponseType.stream,
    headers: {
      'Accept': 'text/event-stream',
      'Accept-Encoding': 'identity',  // ← 关键！阻止中间层 Gzip 缓冲
      'Cache-Control': 'no-cache',
    },
  ),
);
```

- `Accept-Encoding: identity` 阻止反向代理（Nginx、Vercel）对流数据做 Gzip 压缩缓冲，否则客户端只能在流结束后才一次性收到全部数据。
- 消费时使用 `utf8.decode(chunk, allowMalformed: true)` 容忍被截断的多字节字符。
- 流式 Dio 实例须**排除 `LogInterceptor`**，否则拦截器会强制消费整个流。

## 5. 双 Dio 实例模式

同一个 `ChatRepository` 实现中，需要两个 Dio 实例：

| 实例 | 用途 | `responseType` |
|------|-----|--------------|
| `_streamDio` | 流式聊天 | `ResponseType.stream` |
| `_baseDio` | 普通 CRUD（会话列表、创建、删除） | `ResponseType.json`（默认） |

两者共享同一套认证拦截器，但 `_streamDio` 需排除 `LogInterceptor`。

## 6. 全栈联调检查清单

新增一个 Flutter ↔ Next.js API 时，按此顺序逐项检查：

- [ ] Next.js Route Handler 的 `params` 是否用了 `await`（Next.js 15）
- [ ] 后端返回的 JSON 字段名是否与 Freezed 实体的字段名/`@JsonKey(name:)` 一致
- [ ] 后端返回的字段类型（int/string/0-1）是否与 Dart 强类型匹配，不匹配则加 Converter
- [ ] `build_runner` 是否成功生成了 `.g.dart` 和 `.freezed.dart`
- [ ] 流式端点是否设置了 `Accept-Encoding: identity`
- [ ] Dio 拦截器是否会意外消费流数据
