---
name: flutter-code-quality
description: Flutter 代码质量检查与最佳实践指南。在编写 Flutter/Dart 代码时使用，确保代码符合现代 Flutter 规范。适用于：(1) 修复 flutter analyze 警告，(2) 代码审查，(3) 重构遗留代码，(4) 编写新的 Flutter Widget 和 Provider。
---

# Flutter 代码质量最佳实践

本 Skill 提供 Flutter 代码质量检查的核心规则和修复模式。

## 核心规则

### 1. 使用 `debugPrint` 替代 `print`

```dart
// ❌ 避免 - 生产环境有性能开销
print('调试: $data');

// ✅ 推荐 - release 模式自动禁用
debugPrint('调试: $data');
```

**触发条件**: `avoid_print` lint 规则

---

### 2. 使用 `withValues()` 替代 `withOpacity()`

`withOpacity()` 在 Flutter 3.27+ 已废弃，存在浮点数精度损失。

```dart
// ❌ 废弃写法
Colors.black.withOpacity(0.5)

// ✅ 新写法
Colors.black.withValues(alpha: 0.5)
```

**触发条件**: `deprecated_member_use` lint 规则

---

### 3. 尽量使用 `const` 构造函数

`const` 可让编译器在编译期优化，减少运行时开销。

```dart
// ❌ 每次 build 创建新对象
Text('Hello', style: TextStyle(fontSize: 16))

// ✅ 编译期常量
const Text('Hello', style: TextStyle(fontSize: 16))

// ⚠️ 注意：有运行时变量（如 .sp）时不能用 const
Text('Hello', style: TextStyle(fontSize: 16.sp))  // 这里无法 const
```

**触发条件**: `prefer_const_constructors` lint 规则

---

### 4. 避免冗余导入

当使用 `hooks_riverpod` 时，无需同时导入 `flutter_riverpod`。

```dart
// ❌ 冗余
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

// ✅ 只需一个
import 'package:hooks_riverpod/hooks_riverpod.dart';
```

**触发条件**: `unnecessary_import` lint 规则

---

### 5. 局部变量命名规范

Dart 约定：`_` 前缀表示私有成员，局部变量不应使用。

```dart
// ❌ 语义混淆
separatorBuilder: (_, __) => SizedBox(width: 8)

// ✅ 清晰
separatorBuilder: (_, i) => SizedBox(width: 8)
```

**触发条件**: `no_leading_underscores_for_local_identifiers` lint 规则

---

### 6. Riverpod Family Provider 模式

当 Provider 需要参数时，必须使用 Family 模式。

```dart
// ❌ 错误 - NotifierProvider 不支持参数
final detailProvider = NotifierProvider<Controller, State>(...);
ref.watch(detailProvider(id));  // 运行时错误！

// ✅ 正确 - FutureProvider.family
final detailProvider = FutureProvider.autoDispose.family<State, String>(
  (ref, id) async => await loadData(id),
);
ref.watch(detailProvider(id));  // 正确

// ✅ 消费端使用 AsyncValue
asyncState.when(
  loading: () => CircularProgressIndicator(),
  error: (e, _) => Text('Error: $e'),
  data: (state) => buildContent(state),
);
```

**触发条件**: `invocation_of_non_function_expression` 错误

---

## 推荐 analysis_options.yaml 配置

```yaml
include: package:flutter_lints/flutter.yaml

linter:
  rules:
    # 性能相关
    prefer_const_constructors: true
    prefer_const_declarations: true
    prefer_const_literals_to_create_immutables: true
    
    # 代码质量
    avoid_print: true
    unnecessary_import: true
    no_leading_underscores_for_local_identifiers: true
    
    # 可读性
    prefer_single_quotes: true
    require_trailing_commas: true

analyzer:
  errors:
    deprecated_member_use: warning
```

---

## 编码检查清单

在提交代码前，确认以下事项：

| 检查项 | 说明 |
|--------|------|
| ✅ 运行 `flutter analyze` | 确保 0 个问题 |
| ✅ 无 `print()` 语句 | 使用 `debugPrint` |
| ✅ 无 `withOpacity()` | 使用 `withValues()` |
| ✅ 适当使用 `const` | 字面量和常量构造函数 |
| ✅ 无冗余导入 | 检查 hooks_riverpod |
| ✅ Provider 模式正确 | Family 带参数 |
