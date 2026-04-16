# Part 1: 单端代码质量

## 核心规则

### 1.1 使用 `debugPrint` 替代 `print`

```dart
// ❌ 避免 - 生产环境有性能开销
print('调试: $data');

// ✅ 推荐 - release 模式自动禁用
debugPrint('调试: $data');
```

**触发条件**: `avoid_print` lint 规则

---

### 1.2 使用 `withValues()` 替代 `withOpacity()`

`withOpacity()` 在 Flutter 3.27+ 已废弃，存在浮点数精度损失。

```dart
// ❌ 废弃写法
Colors.black.withOpacity(0.5)

// ✅ 新写法
Colors.black.withValues(alpha: 0.5)
```

**触发条件**: `deprecated_member_use` lint 规则

---

### 1.3 尽量使用 `const` 构造函数

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

### 1.4 避免冗余导入

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

### 1.5 局部变量命名规范

Dart 约定：`_` 前缀表示私有成员，局部变量不应使用。

```dart
// ❌ 语义混淆
separatorBuilder: (_, __) => SizedBox(width: 8)

// ✅ 清晰
separatorBuilder: (_, i) => SizedBox(width: 8)
```

**触发条件**: `no_leading_underscores_for_local_identifiers` lint 规则

---

### 1.6 Riverpod Family Provider 模式

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

## Freezed 3.x 最佳实践

### A. 必须使用 `abstract class` 声明

Freezed 3.x 生成的 mixin 要求基类为 `abstract class`。

```dart
// ❌ 错误 - Freezed 2.x 旧语法，3.x 会报错
@freezed
class User with _$User {
  const factory User({required String name}) = _User;
}

// ✅ 正确 - Freezed 3.x 语法
@freezed
abstract class User with _$User {
  const factory User({required String name}) = _User;
}
```

**错误信息**: `non_abstract_class_inherits_abstract_member`

**诊断技巧**: 当遇到此错误时，检查项目中已有的 Freezed 类写法，**优先参考现有代码而非依赖记忆**。

---

### B. build_runner 常见问题

#### 问题 1: `wrote 0 outputs`

新创建的 Freezed 文件可能不会被 build_runner 立即检测到。

```bash
# 解决方案：清理缓存后重新生成
flutter pub run build_runner clean
flutter pub run build_runner build --delete-conflicting-outputs
```

#### 问题 2: 生成代码不更新

当修改 Freezed 类定义后，生成代码未更新。

```bash
# 解决方案：强制删除冲突输出
flutter pub run build_runner build --delete-conflicting-outputs
```

---

### C. Freezed 类作为 Provider.family 的 Key

当 Freezed 类用作 `FutureProvider.family` 的参数时，Freezed 自动生成的 `==` 和 `hashCode` 可确保正确的缓存行为。

```dart
@freezed
abstract class AnalysisParams with _$AnalysisParams {
  const factory AnalysisParams({
    required String question,
    required String answer,
  }) = _AnalysisParams;

  factory AnalysisParams.fromJson(Map<String, dynamic> json) =>
      _$AnalysisParamsFromJson(json);
}

// ✅ 可直接作为 family key
final analysisProvider = FutureProvider.family<Result, AnalysisParams>(
  (ref, params) async => api.analyze(params.toJson()),
);
```

---

### D. Freezed 编码模板

创建新 Freezed 类时，使用以下模板：

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'your_class.freezed.dart';
part 'your_class.g.dart';

@freezed
abstract class YourClass with _$YourClass {
  const factory YourClass({
    required String field1,
    String? optionalField,
    @Default(0) int fieldWithDefault,
  }) = _YourClass;

  factory YourClass.fromJson(Map<String, dynamic> json) =>
      _$YourClassFromJson(json);
}
```

创建后立即运行：

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

---

## 编码检查清单

在提交代码前，确认以下事项：

| ✅ 运行 `flutter analyze` | 确保 0 个问题 |
| ✅ 无 `print()` 语句 | 使用 `debugPrint` |
| ✅ 无 `withOpacity()` | 使用 `withValues()` |
| ✅ 适当使用 `const` | 字面量和常量构造函数 |
| ✅ 无冗余导入 | 检查 hooks_riverpod |
| ✅ Provider 模式正确 | Family 带参数 |
| ✅ Freezed 类使用 `abstract` | 使用 Freezed 3.x 语法 |
