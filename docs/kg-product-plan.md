# 教综知识图谱产品化方案（草案）

> 现状：图谱与映射流程目前是**离线脚本**（`~/data/jiaozong_1680/kg/`），产出 JSON；
> 产品（ai-leaming）里没有图谱，错题只能按 `tags` 粗筛。
> 目标：把「图谱 + 题→节点映射」变成产品能力，让错题本/掌握度/组卷能按**节点**工作。
> 原则：**PDF 解析与抽边永远留在离线管线**，产品只消费"已校验的 JSON"。

---

## 1. 一句话方案

离线管线产出 → **导入接口（带门禁）** → 库里三张表 → 三个读接口 → 两个前端视图。

```
讲义 PDF ──(离线脚本，人工审)──> kg_nodes.json / kg_edges.json
                                        │
                          POST /api/external/kg/import (admin, dryRun, 幂等)
                                        ▼
               kg_nodes ── kg_edges ── question_nodes(题→节点)
                                        │
                 ┌──────────────────────┼──────────────────────┐
        GET /api/kg/graph        错题本 ?node=           掌握度 by=node
        （章节地图）              （按节点筛错题）        （节点级正确率）
```

## 2. 数据模型（3 张表）

```sql
kg_nodes(
  id INTEGER PK, chapter TEXT, node_key TEXT,      -- node_key 章内唯一，如 ch1:广义的教育
  name TEXT, kind TEXT,                            -- concept|facet|work|person|policy
  printed_page INTEGER, chapter_weight REAL,       -- 权重由考频/分值算
  created_at TEXT, UNIQUE(chapter,node_key)
);

kg_edges(
  id INTEGER PK, chapter TEXT,
  from_key TEXT, to_key TEXT, type TEXT,           -- 6 启用 + proposed 类型
  evidence TEXT NOT NULL,                          -- 原句，硬约束
  printed_page INTEGER, schema_version TEXT,
  UNIQUE(chapter, from_key, to_key, type)
);

question_nodes(
  question_id INTEGER REFERENCES questions(id),
  chapter TEXT, node_key TEXT,
  method TEXT,          -- match(score=n) | alias:xxx | manual
  score INTEGER,        -- 匹配置信（题干3/选项2/解析1）
  UNIQUE(question_id, node_key)
);
```

**掌握度不新开表**：`node_mastery = 按 node_key 聚合 practice_logs`（join question_nodes），
与现有 tag 掌握度并行，二者口径都保留（tag 看考点分布，node 看结构薄弱点）。

## 3. 接口

| 方法 | 路径                                        | 说明                                                                                                                                                                                                   |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST | `/api/external/kg/import`                   | admin + 绑 userId；`{chapter, schemaVersion, nodes[], edges[]}`；**导入前跑门禁**（类型已登记 / evidence 非空 / 覆盖率 / 先修无环）；`dryRun`；幂等键 `(chapter,node_key)` 与 `(chapter,from,to,type)` |
| GET  | `/api/kg/graph?chapter=`                    | 节点 + 边（含 evidence），供地图页                                                                                                                                                                     |
| GET  | `/api/kg/nodes?chapter=&kind=`              | 平铺节点（筛选用）                                                                                                                                                                                     |
| GET  | `/api/wrong-book?node=ch1:教育学的创立阶段` | 错题按节点筛（join question_nodes）                                                                                                                                                                    |
| GET  | `/api/mastery?by=node&chapter=`             | 节点级正确率（分子分母都来自 practice_logs）                                                                                                                                                           |
| POST | `/api/external/questions/nodes`             | 批量写题→节点（离线映射器回传，幂等）                                                                                                                                                                  |

现有 `/api/meta` 的 `features` 追加 `kg`。

## 4. 前端（最小两个视图）

1. **章节知识地图**（Web `/kg/[chapter]`）：节点树 + 边类型着色；点节点 → 右侧显示「依据原句 + 关联题 + 我的错题」。移动端先不做地图，只在错题本加「按知识点」一级筛选。
2. **错题本按节点筛**：`?node=` 筛选 + 顶部显示「本节点错 5 题 / 正确率 62%」。

## 5. 门禁（产品化后仍然要的）

| 门禁                    | 位置                                                              | 作用           |
| ----------------------- | ----------------------------------------------------------------- | -------------- |
| 边类型/证据/覆盖率/无环 | 导入接口内（复用 `kg_validate.py` 的规则，搬到 TS）               | 图歪了进不来   |
| schema_version          | 导入必填；`relation_types.json` 版本不一致拒绝                    | 防止半新半旧   |
| 覆盖率报告              | 导入后返回 `{chapters, nodes, edges, coveredSections, missing[]}` | 缺口当场可见   |
| 题→节点映射可复核       | `question_nodes.method/score` 落库                                | 错题归因可解释 |

## 6. 分期与成本

| 期     | 内容                                                 | 成本     | 可独立交付           |
| ------ | ---------------------------------------------------- | -------- | -------------------- |
| **P0** | 3 表迁移 + 导入接口（含门禁）+ 快照 + 集成测试       | 0.5 会话 | ✅ 导入第一章 153 边 |
| **P1** | 题→节点批量写入 + 错题本 `?node=` + 节点级掌握度接口 | 1 会话   | ✅ 错题本可按节点筛  |
| **P2** | Web 知识地图页 + 移动端节点筛选                      | 1 会话   | ✅ 可视化            |
| **P3** | 组卷按节点薄弱抽题、recall 卡片挂 node               | 0.5 会话 | 可选                 |

**备考期建议只做 P0 + P1**（1.5 会话），P2 等 4 月考完。

## 7. 明确不做

- 不在产品里解析 PDF / 跑抽边（离线管线已够，且需要人工审）；
- 不引入图数据库（166 节点用 SQLite 足够）；
- 不在产品里改 `relation_types`（类型变更走离线 schema + 重新导入）；
- 不做自动"先修诊断"（图只用于筛选与展示，不宣称因果）。

## 8. 迁移与回填

- 第一章：`ch1-edges-v3.json`（153 边 / 166 节点）直接作为首导入；
- 题→节点：用 `map_wrong.py` 的规则扩展到**全量 1834 题**（不只错题），离线跑一次，产出 `question_nodes.json`；
- 全量入库后，现有 `tags` 掌握度保持不变，新增 `by=node` 视图做对照。

## 9. 验收

1. `POST /kg/import?dryRun=true` 返回门禁报告，真导后重导 `duplicate:true`；
2. 制造一条"缺 evidence"的边 → 导入 400 并指出边；
3. 错题本 `?node=ch1:教育学的创立阶段` 返回第一章 17 题中的对应子集；
4. 节点级掌握度与现有 tag 掌握度对同一批答题给出**不同但可解释**的口径（写进文档，不互相覆盖）。
