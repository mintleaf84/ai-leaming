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

## 2. 功能完整性校验 (Functional Integrity)

**在合并或删除任何文件前，必须进行“功能对账”：**

- **导出清单**：列出原文件（如 `actions/mindmap.ts`）中所有导出的函数名。
- **高价值资产识别**：特别检查是否包含 **AI Prompt**、**复杂正则表达式** 或 **加密算法**。这些逻辑通常不是纯粹的 DB CRUD，容易在重构中被遗漏。
- **逐项打勾**：确保新文件中有对应的实现，或确认该功能已废弃。

## 3. 状态保护 (State Protection)

- **Git 洁净度**：开始重构前，确保 `git status` 是干净的。
- **原子化提交**：每完成一个子任务（如：Schema 修改、服务拆分、引用更新）即进行一次 commit。
- **写操作谨慎**：避免在 `write_to_file` 中无差别使用 `Overwrite: true`。
  - **安全模式**：先在新位置创建代码，修改调用方，最后才执行物理删除。

## 4. Schema 双路对齐 (Schema Alignment)

- **数据库与代码同步**：修改 `src/lib/db/schema.ts` 后，同步修改 `src/lib/schemas.ts`。
- **默认值一致性**：确保 SQL `DEFAULT` 与 Zod `.default()` 逻辑一致。

## 5. 高保真测试模拟 (Robust Mocking)

- **SQL 匹配精准化**：Mock `db.prepare` 时，应根据完整的 SQL 关键词进行 `mockImplementation`。
- **顺序一致性**：Mock 必须包含所有中间步骤的返回（如 `isDemoModeEnabled`）。

## 6. 故障恢复流程 (Recovery Workflow)

如果发现误删或覆盖：
1. **立即停止**所有写操作。
2. 使用 `git checkout -- <path>` 或 `git restore` 恢复。
3. 如果已提交，使用 `git show HEAD^:<path>` 提取丢失代码。
4. 记录教训并更新此指南。
