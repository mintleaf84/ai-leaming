---
name: project-lint-standards
description: 本项目的 ESLint 代码规范与编码标准指南。涵盖 TypeScript 规则、测试文件规范以及项目特有的架构约束。在进行代码开发、重构或代码审查时使用，以确保代码库的一致性和高质量。
---

# 项目代码规范 (Project Lint Standards)

本技能定义了「AI Learning」项目的 ESLint 规则和通用编码标准。

## ESLint 核心配置

项目采用 ESLint 9 (Flat Config)，主要继承自：

- `eslint-config-next/core-web-vitals`
- `eslint-config-next/typescript`

### TypeScript 规则

- **禁止隐式 any (`@typescript-eslint/no-explicit-any`)**: `warn`。应尽量定义具体类型。
- **未使用变量 (`@typescript-eslint/no-unused-vars`)**: `warn`。
  - **排除模式**: 任何以下划线 `_` 开头的变量、参数或错误（如 `_item`, `_error`）都会被忽略。
- **禁止 require (`@typescript-eslint/no-require-imports`)**: `warn`。统一使用 `import` 语句。

### 测试文件规范

针对 `tests/**` 和 `**/*.test.ts/tsx` 文件：

- **禁用 Hook 规则 (`react-hooks/rules-of-hooks`)**: `off`。允许在测试环境中更灵活地使用 Hook。

## 编码标准与最佳实践

### 语言与文档

- **全中文环境**: 所有代码注释、文档字符串、Git 提交信息必须使用 **简体中文**。
- **KISS 原则**: 保持代码简单，避免过度设计。

### 架构约束

- **API 开发**: 必须使用 **Hono** 框架。禁止创建传统的 Next.js API Routes (`app/api/.../route.ts`)。相关细节请参考 `hono-api-development` 技能。
- **目录结构**: 移动端遵循 Feature-First 结构。

## 检查与修复

运行以下命令进行代码检查：

```bash
npm run lint
```
