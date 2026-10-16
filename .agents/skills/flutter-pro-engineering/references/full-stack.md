# Part 3: 全栈联调（Flutter ↔ Next.js）

## 3.1 Next.js 15 动态路由参数必须 `await`

Next.js 15 中，Route Handler 的 `params` 和 `searchParams` 变为 **异步 Promise**。

**问题现象**：直接访问 `params.id` 会得到 `undefined`，导致 `parseInt` 返回 `NaN`，最终返回 400。

**根本原因**：Next.js 15 进行了破坏性更新，不能再直接同步访问动态路由参数。

**正确应对**：必须将 `params` 声明为 Promise，并在使用其字段前使用 `await` 解包。

```typescript
// ❌ 旧写法 (Next.js 14)
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = parseInt(params.id, 10); // NaN!
}

// ✅ 新写法 (Next.js 15)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
}
```

**触发场景**：任何 `[id]`、`[slug]` 等动态路由段的 Route Handler。

---

## 3.2 Freezed 实体的 `fromJson` 不可随意重写

**问题现象**：Freezed 搭配 `json_serializable` 时，尝试自定义 `fromJson` 函数体来处理类型转换，却导致 `build_runner` 失效。

**根本原因**：

1. **两端类型哲学不同**：后端数据库（MySQL、SQLite）传出的 ID 往往是自增 `int`，布尔值往往是 `tinyint` (`0` 或 `1`)；而 Flutter 客户端因为要兼容 UUID 等需求，字段通常会定死为明确的强类型（如 `String`，`bool`）。
2. **代码生成器的 AST 洁癖**：生成的 `fromJson` 映射**仅仅认准一行代码形式**的工厂方法。如果改为自定义函数体（如添加类型转换逻辑），`build_runner` 会跳过 `.g.dart` 的生成，导致 `_$FooFromJson` 未定义。

**正确做法**：使用 `JsonConverter` 或 `@JsonKey` 在字段级别处理类型不一致，**绝对不要改写 `factory fromJson` 签名**。

---

### 3.2.1 针对复杂类型强转：使用 `JsonConverter`（例如 `int` 转 `String`）

```dart
// 1. 创建类型清洗转换器
class StringIdConverter implements JsonConverter<String, dynamic> {
  const StringIdConverter();

  @override
  String fromJson(dynamic json) => json.toString(); // 强行拉平弱类型

  @override
  dynamic toJson(String object) => object;
}

// 2. 将其注解在需要的字段上
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

---

### 3.2.2 针对基础平替强转：使用 `@JsonKey(fromJson: ...)`（例如 `0/1` 转 `bool`）

```dart
// 1. 编写游离的全局转译函数
bool _boolFromInt(dynamic value) {
  if (value is int) return value == 1;
  if (value is bool) return value;
  return false;
}

// 2. 直接注入到模型字段配置中
@freezed
abstract class ChatMessage with _$ChatMessage {
  const factory ChatMessage({
    required String id,
    // 使用 fromJson 进行介入。
    // 注：若与 @Default 混用，@Default 要写在前面
    @Default(false) @JsonKey(name: 'is_favorite', fromJson: _boolFromInt) bool isFavorite,
  }) = _ChatMessage;

  factory ChatMessage.fromJson(Map<String, dynamic> json) =>
      _$ChatMessageFromJson(json);
}
```

---

## 3.3 后端弱类型字段的常见映射陷阱

| 后端字段      | 后端实际类型 | Flutter 期望类型 | 解决方案                                                |
| ------------- | ------------ | ---------------- | ------------------------------------------------------- |
| `id`          | `int`        | `String`         | `@StringIdConverter()`                                  |
| `is_favorite` | `int` (0/1)  | `bool`           | `@JsonKey(name: 'is_favorite', fromJson: _boolFromInt)` |
| `created_at`  | `String`     | `DateTime`       | `@JsonKey(fromJson: DateTime.parse)`                    |

---

## 3.4 Dio 流式响应配置要点

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

**关键点**：

- `Accept-Encoding: identity` 阻止反向代理（Nginx、Vercel）对流数据做 Gzip 压缩缓冲，否则客户端只能在流结束后才一次性收到全部数据。
- 消费时使用 `utf8.decode(chunk, allowMalformed: true)` 容忍被截断的多字节字符。
- 流式 Dio 实例须**排除 `LogInterceptor`**，否则拦截器会强制消费整个流。

---

## 3.5 双 Dio 实例模式

同一个 `ChatRepository` 实现中，需要两个 Dio 实例：

| 实例         | 用途                              | `responseType`              |
| ------------ | --------------------------------- | --------------------------- |
| `_streamDio` | 流式聊天                          | `ResponseType.stream`       |
| `_baseDio`   | 普通 CRUD（会话列表、创建、删除） | `ResponseType.json`（默认） |

两者共享同一套认证拦截器，但 `_streamDio` 需排除 `LogInterceptor`。

---

## 3.6 全栈联调检查清单

新增一个 Flutter ↔ Next.js API 时，按此顺序逐项检查：

- [ ] Next.js Route Handler 的 `params` 是否用了 `await`（Next.js 15）
- [ ] 后端返回的 JSON 字段名是否与 Freezed 实体的字段名/`@JsonKey(name:)` 一致
- [ ] 后端返回的字段类型（int/string/0-1）是否与 Dart 强类型匹配，不匹配则加 Converter 或 @JsonKey
- [ ] `build_runner` 是否成功生成了 `.g.dart` 和 `.freezed.dart`（运行 `flutter pub run build_runner build --delete-conflicting-outputs`）
- [ ] 流式端点是否设置了 `Accept-Encoding: identity`
- [ ] Dio 拦截器是否会意外消费流数据（LogInterceptor 已排除）
