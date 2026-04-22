---
name: refactoring-safety-guide
description: 复杂代码库中安全重构的最佳实践，重点预防文件覆盖、命名冲突和回归错误。在进行以下操作时必须启用：(1) 拆分单体文件，(2) 创建新服务模块，(3) 重构核心业务逻辑。
---

# 安全重构指南 (Refactoring Safety Guide)

本指南旨在规范重构流程，防止因操作疏忽导致的生产力损失和功能丢失。

## 1. 写入前的资产盘点 (Mandatory Inventory)

**在创建任何新文件或重构已有模块前，必须执行：**

- **目录扫描**：使用 `list_dir` 或 `ls` 完整列出目标目录（如 `src/lib/services` 或 `src/server/actions`）下的所有文件。
- **命名空间核查**：确认新文件名不会侵占已有功能的领地。
  - *反例*：为了“知识树”功能创建 `knowledge.ts`，却覆盖了原有的“知识卡片”服务。
  - *正例*：使用更具象的命名，如 `knowledge-tree.ts` 或 `practice-service.ts`。

## 2. 状态保护 (State Protection)

- **Git 洁净度**：开始重构前，确保 `git status` 是干净的。
- **原子化提交**：每完成一个子任务（如：Schema 修改、服务拆分、引用更新）即进行一次 commit。
- **写操作谨慎**：避免在 `write_to_file` 中无差别使用 `Overwrite: true`。除非你百分之百确定该文件是新创建的，或者你已经备份了旧内容。

## 3. Schema 双路对齐 (Schema Alignment)

- **数据库与代码同步**：修改 `src/lib/db/schema.ts`（物理表结构）后，必须同步修改 `src/lib/schemas.ts`（Zod 验证逻辑）。
- **默认值一致性**：确保 SQL 定义的 `DEFAULT` 值与 Zod 的 `.default()` 逻辑保持一致，防止在测试 Mock 时出现数据校验失败。

## 4. 高保真测试模拟 (Robust Mocking)

在编写针对 Server Actions 的测试时：

- **SQL 匹配精准化**：在 Mock `db.prepare` 时，不要只匹配表名。如果一个函数内有多次查询，应根据完整的 SQL 关键词进行 `mockImplementation`。
- **顺序一致性**：如果逻辑中包含全局开关检查（如 `DemoService.isDemoModeEnabled`），Mock 必须包含该步骤的返回，否则后续的 SQL 匹配顺序会错位。
- **日期与时区**：SQLite 的日期函数（如 `datetime('now')`）与 JS 的 `toISOString()` 存在微小差异。在 Mock 恢复会话逻辑时，优先使用符合 SQLite 规范的日期字符串。

## 5. 故障恢复流程 (Recovery Workflow)

如果发现误删或覆盖：
1. **立即停止**所有写操作。
2. 使用 `git checkout -- <path>` 恢复受影响文件。
3. 如果尚未提交，使用 `git diff` 提取丢失的代码片段。
4. 重新规划命名空间，避免二次冲突。
