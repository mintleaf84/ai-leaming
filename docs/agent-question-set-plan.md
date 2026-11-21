# Agent 推题与题集：需求对齐与实施方案（草案，未执行）

> 状态：待你确认后开工
> 已对齐的决策（本文件为唯一记录）：
>
> 1. 推来的题进**独立 Agent 题集**，不污染题库搜索与统计；
> 2. 题集可逐题练，也可**一键成卷**（复用刚上线的试卷/模考）；
> 3. agent 可读：题集结果 + 错题 + 掌握度 + **题库全量（含答案解析）**；
> 4. 不设预览闸，**直接可做**；每题旁可标「这题有问题」；
> 5. 报错 → 该题**立即从题集移除**，并在结果接口回传 `flagged[]` 供 agent 修正后推新批次；
> 6. 批次**不可变**：同 `batchKey` 重推幂等返回原批次，新内容只能新建批次；
> 7. 先服务端，Web 与移动端**两端并行**消费；
> 8. 移动端**要通知**你「有新题集」；
> 9. 存储采用**打标记过滤**（写入 `questions`，`origin='agent'` 三处过滤），不做物理隔离；
> 10. 通知本期只做**启动/回前台拉未读 → 本地通知 + 首页角标**，不做 Android 周期拉取、不做真推送。

---

## 1. 现状（已具备的零件）

| 能力           | 现状                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| agent 写题     | `POST /api/external/questions`（单题、admin 作用域、内容指纹幂等、`?dryRun=true`）      |
| agent 回传作答 | `POST /api/external/practice/answers`（`sessionKey` 幂等、按 tags 增量刷掌握度）        |
| agent 读数据   | `read` 作用域：题库（含答案）/错题/掌握度/统计/历史/记忆卡队列                          |
| 身份           | API Key 可绑 `user_id`，作用域 read ⊂ write ⊂ admin；全局限流                           |
| 消费侧         | 练习（`practice_sessions`/`practice_logs`）、试卷/模考（`exam_papers`）、错题本、掌握度 |
| 移动端         | 能力协商（`/api/meta` 的 `features`）、离线练习与回传                                   |

**缺口**：没有「一次推送 = 一批题」的容器，没有「我的作答结果」反向读给 agent，没有消费入口与通知。

## 2. 核心取舍：题怎么存（必须先定）

`practice_logs.question_id` 是 `questions(id)` 的外键，而错题本/掌握度/历史/统计全部基于它。若把 agent 题放进**另一张表**，这些能力要么全部重写，要么 agent 题永远进不了错题本。

**方案（推荐）**：写入 `questions`，但打「隔离标记」，靠过滤实现"不污染"：

```sql
ALTER TABLE questions ADD COLUMN origin        TEXT NOT NULL DEFAULT 'import'; -- import | agent
ALTER TABLE questions ADD COLUMN agent_set_id  INTEGER REFERENCES agent_question_sets(id);
CREATE INDEX idx_questions_origin ON questions(origin);
```

- `origin='agent'` 的行：**不进**题库列表、不进自动组卷候选、**不进**掌握度聚合（这三处加 `origin='import'` 过滤）；
- 但**可以**进错题本与历史（那是你自己的记录，看到"来自 AI 题集"的标记反而有用）；
- 报错 → `origin` 置 `'flagged'`（或直接软删标记），消费侧所有查询过滤掉；
- 「转正」→ `origin='import'`，从此就是正常题库题。

代价：三处查询各加一个过滤条件（约 6 行 SQL），换来错题本/掌握度/历史零改动。
**这是本方案唯一需要你点头的结构性取舍**——若你坚持物理隔离（独立表），错题本与掌握度对 agent 题就不生效。

## 3. 数据模型

```sql
CREATE TABLE agent_question_sets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_key     TEXT    NOT NULL,              -- agent 生成，幂等键
  title         TEXT    NOT NULL,
  agent         TEXT,                          -- 哪个工具（如 "claude-code"）
  model         TEXT,                          -- 可选，留痕
  prompt_version TEXT,
  target_tags   TEXT,                          -- JSON：它声称针对的考点
  note          TEXT,                          -- 「为什么给你出这些」
  status        TEXT    NOT NULL DEFAULT 'active',  -- active | archived | promoted
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, batch_key)
);
-- 题目本体直接落 questions（见 §2），set 与题的关联靠 questions.agent_set_id + position
ALTER TABLE questions ADD COLUMN agent_position INTEGER;  -- 批次内顺序（1..n）
```

## 4. 接口

### 4.1 Agent 侧（`/api/external`，沿用 API Key）

| 方法 | 路径                                | 说明                                                                                                                                                                                                                                                                                                                             |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST | `/agent/question-sets`              | `{batchKey, title, agent?, model?, promptVersion?, targetTags?, note?, questions:[{externalId?, content, options, answer, explanation?, type, dimension?, tags?, material?}]}`；**整批校验**（任一题不合格整批 400，不做部分成功）；`(user_id,batchKey)` 幂等返回既有批次 `duplicate:true`；单批上限 100 题；支持 `?dryRun=true` |
| GET  | `/agent/question-sets`              | 列表：`id/title/counts/doneCount/flaggedCount/createdAt`                                                                                                                                                                                                                                                                         |
| GET  | `/agent/question-sets/{id}`         | 含题目与答案（agent 需要看自己推了什么）                                                                                                                                                                                                                                                                                         |
| GET  | `/agent/question-sets/{id}/results` | **核心回流**：每题 `answered/isCorrect/durationMs/flagged/flagReason`，聚合 `correctRate/avgDurationMs/tagBreakdown`，`flagged[]` 单独列出（含题干与你的理由）                                                                                                                                                                   |
| POST | `/agent/question-sets/{id}/archive` | 归档（不影响历史）                                                                                                                                                                                                                                                                                                               |

作用域：**admin**（题库是全局资产，沿用建题口径）；key 必须绑 `userId`，否则 403。
读结果只允许该 `userId` 的批次，跨用户 404。

### 4.2 消费侧（JWT，`/api/agent-sets`）

| 方法 | 路径                                           | 说明                                                                                                                                        |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GET  | `/agent-sets`                                  | 我的题集（含未做数、来源、目标考点）                                                                                                        |
| GET  | `/agent-sets/{id}`                             | 题集详情（**不含答案**）                                                                                                                    |
| POST | `/agent-sets/{id}/attempts`                    | 开始练：建 `practice_sessions`（`practice_mode='agent_set'`、`agent_set_id`），逐题即时判分（复用现有 `POST /practice/session/:id/submit`） |
| POST | `/agent-sets/{id}/questions/{questionId}/flag` | `{reason?}` → 该题从题集移除并记录，返回剩余题数                                                                                            |
| POST | `/agent-sets/{id}/promote`                     | 转正入库（`origin='import'`）                                                                                                               |
| POST | `/agent-sets/{id}/paper`                       | **一键成卷**：建一张 `exam_papers`（`source='agent'`），题目取该题集可用题                                                                  |

### 4.3 已冻结的响应形状（三条 lane 必须逐字对齐）

消费侧（JWT）：

- `GET /agent-sets` → `{data:[{id,title,agent,model,targetTags:[string],questionCount,pendingCount,unreadCount,lastScore(0–1|null),createdAt}],meta:{limit,offset,total}}`
- `GET /agent-sets/{id}` → `{set:{...同上},questions:[{id,content,options:[string],type,dimension,tags:[string],material}],flaggedCount}`（**不含 answer/explanation**）
- `POST /agent-sets/{id}/attempts` → `{sessionId,questions:[...同上]}`（逐题提交仍走 `POST /practice/session/{sessionId}/submit`）
- `POST /agent-sets/{id}/questions/{questionId}/flag` → `{questionId,flagged:true,remaining}`
- `POST /agent-sets/{id}/promote` → `{setId,promoted:true,promotedCount}`
- `POST /agent-sets/{id}/paper` → 与试卷详情同形 `{paper,items,lastAttempt}`

Agent 侧（API Key，admin）：

- `POST /agent/question-sets` → `{id,batchKey,duplicate,questionCount}`
- `GET /agent/question-sets` → `{data:[...],meta:{limit,offset,total}}`（含 `questionCount/doneCount/flaggedCount/createdAt`）
- `GET /agent/question-sets/{id}` → `{set:{...},questions:[...]}`（**含答案与解析**，agent 要能看自己推了什么）
- `GET /agent/question-sets/{id}/results` → `{setId,summary:{answered,total,correctRate,avgDurationMs,tagBreakdown:[{tag,answered,correctRate}]},items:[{questionId,answered,isCorrect,durationMs,flagged,flagReason}],flagged:[{questionId,content,reason}]}`
- 分数一律 0–1 小数；`durationMs` 整数毫秒。

### 4.4 实现补丁（合并时定稿）

- 消费侧列表项与详情 `set` **新增 `status: active|promoted|archived`**（移动端要显示「已转正」，否则转正后按钮仍可点）。
- `questionCount` 口径确认为**批次原始题量（含被报错的题）**；`pendingCount = 可用题 − 已做`，因此 `questionCount − pendingCount − flaggedCount = doneCount`。
- 打开详情即已读（`agent_question_sets.read_at`，迁移 0026），列表接口只读；从未打开但已开始作答也算已读。
- 分页：`limit` 默认 20 / 上限 100，`offset` 默认 0，`meta` 回显夹取后的值。

## 5. 消费端

**Web**：`/agent-sets` 列表（来源、目标考点、未做/未读、最近成绩）+ 题集练习页（复用练习页卡片，右上角「这题有问题」）+「一键成卷」+「转正入库」。
**移动端**：同结构；首页入口「AI 题集」带未读角标；能力协商 `supports('agent_sets')` 缺失时隐藏。

## 6. 通知（需要你知道的现实约束）

没有服务端推送通道时，**"后台推送"做不到**：

- 本地通知只能在 App 进程活着时发出；
- Android 可用 `workmanager` 周期性拉取（系统最小 15 分钟，且被厂商省电策略限制）；
- iOS 侧不可靠。

建议分两步：

1. **先做**：App 启动/回前台时拉一次未读 → 有新的就发一条本地通知 + 首页角标（成本低、行为可预期）；
2. **可选后补**：Android `workmanager` 周期拉取（引入依赖 + 电量/厂商适配）。

真推送（FCM/APNs/WebPush）需要服务端与证书，属另一件事，不在本期。

## 7. 验收（开工后）

1. agent 用 admin key 推 10 题 → 幂等重推 `duplicate:true` 且不新增；
2. 你在 Web 做完 6 题、标 1 题有问题 → agent 的 `/results` 里 `flagged[]` 含那题，题集剩 9 题且已做的不再出现；
3. 一键成卷 → 试卷可限时作答 → 成绩单正常；
4. 转正后题目出现在题库列表与自动组卷候选中，掌握度开始计入；
5. 移动端首页角标 + 启动通知；断网时题集列表可读（缓存）或明确报错，不装成空。

## 8. 已确认（2026-11-21）

1. 隔离方式：**打标记过滤**——`origin='agent'` 的行不进题库列表/自动组卷/掌握度，但错题本与历史照常收录；
2. 通知范围：**只做启动/回前台拉未读 + 本地通知 + 首页角标**，不引入 `workmanager`，不做 FCM/APNs。

开工顺序（待你发令）：Lane A 服务端（迁移 + `agent_question_sets` + 9 条接口 + 结果回流 + 归属矩阵/快照）→ Lane B Web（题集列表/练习/报错/成卷/转正）与 Lane C 移动端（同结构 + 角标/启动通知）并行。
