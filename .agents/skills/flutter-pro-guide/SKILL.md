---
name: flutter-pro-guide
description: 现代 Flutter 开发权威指南。强制使用 Riverpod, Freezed, Retrofit, Screenutil 等高级技术栈。适用于追求极致工程质量的项目。
---

# Flutter Pro Guide

> **Core Philosophy**: Modern, High-Quality, Type-Safe, Immutable, and Responsive.

This skill outlines the **mandatory** standards for modifying the `mobile_app` project. It adopts a **Progressive Disclosure** approach: adhere to the high-level principles first, then refer to specific sections for implementation details or basic tutorials.

## 1. High-Level Principles (The Law)

1. **State Management**: **MUST** use **Riverpod** (v2/v3+).
   - _Prohibited_: `Provider`, `GetX`, `setState` (for business logic).
2. **Immutability**: **MUST** use **Freezed** for all data models and state.
   - _Prohibited_: Mutable Dart classes, manual `copyWith`, manual `==` overrides.
3. **Networking**: **MUST** use **Retrofit** + **Dio**.
   - _Prohibited_: `http` package, manual `Dio` requests without Retrofit interfaces.
4. **UI Responsiveness**: **MUST** use **flutter_screenutil**.
   - _Prohibited_: Hardcoded logical pixels (e.g., `width: 100`) without adaptation.
5. **Language**: **English** for code/comments (Technical consistency), **Chinese** for documentation/thought process (User requirement).

---

## 2. Architecture & Structure

Adhere to the clean architecture layers defined in the project:

```text
lib/
├── data/           # Data Layer (Retrofit APIs, DTOs, Repositories)
├── domain/         # Domain Layer (Business Entities, Freezed Models)
├── presentation/   # UI Layer (Screens, Widgets, Providers)
└── core/           # Shared Utilities (Extensions, Constants)
```

---

## 3. Implementation Specifications

### 3.1 State Management (Riverpod)

**Rule**: Use `NotifierProvider` or `AsyncNotifierProvider` for all business logic. Avoid `StateProvider` for complex logic.

- **View Layers**: extending `ConsumerWidget` or `ConsumerStatefulWidget`.
- **Reading State**: Use `ref.watch` in `build()`, `ref.read` in callbacks.

### 3.2 Data Models (Freezed)

**Rule**: All domain models must be defined as Freezed classes.

- Use `@freezed` and `_$ClassName` mixin.
- Use `factory .fromJson` for API deserialization.

### 3.3 UI Sizing (Screenutil)

**Rule**: Never use raw doubles for layout sizes.

- **Width**: `100.w`
- **Height**: `100.h`
- **Font**: `16.sp`
- **Radius**: `8.r`

### 3.4 Networking (Retrofit)

**Rule**: Define APIs as abstract classes with Retrofit annotations.

```dart
@RestApi()
abstract class RestClient {
  factory RestClient(Dio dio, {String baseUrl}) = _RestClient;

  @GET("/tasks")
  Future<List<Task>> getTasks();
}
```

---

## 4. Dart Best Practices & Tutorials

### 4.1 Syntax & Style (Effective Dart)

- **Null Safety**: Avoid `!` operator. Use `?` and `??` for safe unwrapping.
- **Async/Await**:
  - ALWAYS use `await` instead of `.then()`.
  - Use `Future.wait([])` for parallel execution.
  - Return `Future<void>` not `void` for async functions.
- **Collections**:
  - Use `[]` and `{}` literals.
  - Use collection if/for: `[if (active) item, for (var i in items) i]`.
  - Use `.map().toList()` and `.where()` for transformations.
- **Functions**:
  - Use arrow syntax `=>` for one-liners.
  - Key arguments by name using `{required Param param}`.

### 4.2 Error Handling

- **Try/Catch**: Wrap distinct logical blocks, not entire big functions.
- **Custom Exceptions**: Throw domain-specific exceptions (e.g., `AuthException`), not generic strings.
- **Logging**: Use `logger.e(e, stackTrace)` (or project equivalent) instead of `print()`.

### 4.3 Documentation Standards

- **Public API**: DO comment public classes/methods using `///`.
- **Why, not What**: Explain _why_ this logic exists, not _what_ the syntax does.
- **Language**: Comments in English (for code consistency) or Chinese (if complex business logic).

---

## 5. Detailed Lint Rules (Reference)

We follow standard Flutter linting with stricter rules for maintainability:

- `always_declare_return_types`: true
- `avoid_print`: true (Use Logger)
- `annotate_overrides`: true
- `unawaited_futures`: true (Don't lose async tasks)
- `prefer_const_constructors`: true (Performance)
- `prefer_final_locals`: true (Immutability)

---

## 6. Layout & Visual Guidelines (Reference)

### 6.1 Layout Best Practices

- **Overflow Safety**:
  - Use `Expanded` or `Flexible` inside Row/Column.
  - Wrap text-heavy widgets in `SingleChildScrollView` if dynamic.
  - Use `Wrap` instead of Row if items might exceed width.
- **Performance**:
  - Use `const` Widgets whenever possible.
  - Use `ListView.builder` for long lists (never `Coloum` with children).
  - Extract large build methods into separate Widget classes (not helper methods).

### 6.2 Visual Hierarchy

- **Typography**: Stick to the App Theme (`Theme.of(context).textTheme`). Don't hardcode styles.
- **Spacing**: Use consistent spacing constants (e.g., `Gap(16.w)` or `SizedBox(height: 16.h)`).
- **Colors**: Use `Theme.of(context).colorScheme.primary` etc., avoiding hardcoded `Colors.blue`.
