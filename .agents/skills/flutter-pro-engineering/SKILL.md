---
name: flutter-pro-engineering
description: Flutter 工程化完整指南。从单端代码质量、项目目录迁移，到 Next.js 全栈联调，覆盖现代 Flutter 开发的全链条工程实践。适用于：(1) flutter analyze 警告修复，(2) 大规模目录重构与 import 迁移，(3) Freezed/JSON 数据映射，(4) Flutter 与 Next.js 全栈联调。
---

# Flutter 工程化完整指南

现代 Flutter 开发涵盖代码质量、工程管理和多端联调三大维度。本技能将知识组织为三个递进的模块，按需加载。

## 三大工程维度

### Part 1: 单端代码质量

修复 `flutter analyze` 警告、优化性能、规范 Dart 代码写法。涵盖 lint 规则、const 优化、Riverpod Provider 模式、Freezed 3.x 最佳实践。

**触发场景**：编写新 Widget、修复编译警告、代码审查。
→ [详见 code-quality.md](references/code-quality.md)

---

### Part 2: 项目迁移与维护

大规模重构项目目录结构（功能优先 vs 层级优先）、批量修正 import 路径、处理 build_runner 已知 bug。涵盖 git 操作、PowerShell 编码陷阱、生成文件迁移。

**触发场景**：项目架构调整、目录重组、import 路径统一。
→ [详见 migration.md](references/migration.md)

---

### Part 3: 全栈联调（Flutter ↔ Next.js）

Flutter 移动端对接 Next.js 后端时的常见陷阱与最佳实践。涵盖 Next.js 15 params 异步化、Freezed 弱类型映射、Dio 流式响应、双实例模式。

**触发场景**：Flutter 新增 API 接口、数据序列化错误、流式传输配置。
→ [详见 full-stack.md](references/full-stack.md)

---

## 快速导航

- **"我的代码有 lint 警告"** → 查看 Part 1，使用 `analysis_options.yaml` 配置
- **"要重构项目目录"** → 查看 Part 2，使用 PowerShell 脚本和 `git mv`
- **"Flutter 收不到 API 数据"** → 查看 Part 3，检查 Freezed fromJson 和 @JsonKey
- **"build_runner 卡住了"** → 查看 Part 2 的 build_runner 递归 Bug 解决方案

---

## 核心设计原则

1. **单端代码质量** 是基础，确保本地代码规范和性能
2. **项目迁移维护** 是工程管理，避免重构中的编码问题
3. **全栈联调** 是集成，解决跨平台数据映射和流式传输问题

遇到问题时，**按上述顺序** 排查：先检查本地代码，再检查迁移工具，最后检查跨端接口。
