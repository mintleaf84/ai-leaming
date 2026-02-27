---
name: flutter-nextjs-integration-traps
description: 记录 Flutter (Freezed) 与 Next.js 15 集成时的常见数据解析陷阱与路由参数坑。在进行前后端联调或编写数据模型时使用此技能，避免重蹈覆辙。
---

# Flutter & Next.js 跨端联调防坑指南

在开发类似琢玉 (ai-learning) 这样由 Next.js (Web/API) 和 Flutter (App) 组成的跨端项目时，由于数据类型、后端框架版本更新以及代码生成器的严格性差异，容易踩入隐蔽的陷阱。请在后续开发中严格参考本经验总结。

## 1. Next.js 15 动态路由参数 (`params`) 的异步化陷阱

**问题现象**：在 Next.js 15 的 Route Handlers 中（例如 `app/api/chat/sessions/[id]/route.ts`），当尝试直接通过 `params.id` 读取动态参数时，运行时抛出解构失败或 `ID invalid` 的错误。
**根本原因**：Next.js 15 进行了破坏性更新，将所有动态路由的 `params` 和查询参数 `searchParams` 变更为了 `Promise` 类型，不能再直接同步访问。
**正确应对**：必须将 `params` 声明为 Promise，并在使用其字段前使用 `await` 解包。

```typescript
// ❌ 错误案例 (Next.js 14 及以下语法，将在 Next.js 15 中报错)
export async function GET(req: Request, { params }: { params: { id: string } }) {
    const id = params.id; 
}

// ✅ 正确案例 (Next.js 15 现行规范)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    const id = resolvedParams.id;
}
```

## 2. Flutter Freezed 模型强类型与 API 弱类型数据的剧烈摩擦

**问题现象**：Flutter 接收到后端 API 正常的调用响应，但数据并没有渲染出来，也不抛出显式 Crash。控制台打出类型不匹配异常（如 `type 'int' is not a subtype of type 'String'` 在 JSON 序列化时引发阻塞）。当我们尝试去手动重写实体的 `factory fromJson` 函数来规避时，却导致 `build_runner` 失效，抛出 `uri_has_not_been_generated` 错误。

**根本原因**：

1. **两端类型哲学不同**：后端数据库（如 MySQL、SQLite）传出的 ID 往往是自增 `int`，布尔值往往是 `tinyint` (`0` 或 `1`)；而 Flutter 客户端因为要兼容 UUID 等需求，字段通常会定死为明确的强类型（如 `String`，`bool`）。这导致原样映射必然失败。
2. **代码生成器的 AST 洁癖**：Flutter 中的 `Freezed` 与 `json_serializable` 高度耦合，生成的 `fromJson` 映射**仅仅认准一行代码形式**的工厂方法。如果你强行在里面加入 `if (json['id'] != null) json['id'] = json['id'].toString();` 这样的清洗代码，生成引擎就会直接放弃该文件，导致 `.g.dart` 彻底难产。

**正确应对**：
绝对不要通过打乱 `factory fromJson` 签名的方法去清洗数据。针对不同的类型，应使用以下优雅的注解方案从前端兜底：

### A. 针对复杂类型强转 (例如 `int` 转 `String`)：编写并使用 `JsonConverter`

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
    @StringIdConverter() required String id, // 安全使用
    required String content,
  }) = _ChatMessage;

  // 永远保持下方的极简映射原貌！
  factory ChatMessage.fromJson(Map<String, dynamic> json) => _$ChatMessageFromJson(json);
}
```

### B. 针对基础平替强转 (例如 `0/1` 转 `bool`)：使用 `@JsonKey(fromJson: ...)`

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
    // 注：若与 @Default 混用，小心警告：// ignore: invalid_annotation_target 
    @JsonKey(name: 'is_favorite', fromJson: _boolFromInt) @Default(false) bool isFavorite,
  }) = _ChatMessage;
  ...
```

使用上面两种标准的方法，即可在不触怒 `build_runner` 的前提下，平滑对接极不规范的后端弱类型和潜规则数据。
