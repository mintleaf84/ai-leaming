# 试卷（模考）功能：契约与实施计划

> 状态：契约冻结（2026-11-20），三条 lane 并行按此实现
> 目标：手工组卷 + 自动组卷；支持限时；Web 与移动端共用一套 REST
> 复用原则：判分走 `src/lib/services/answer-check.ts` 的唯一实现；作答结果仍落
> `practice_sessions` / `practice_logs`，**错题本、掌握度、历史、统计自动生效**，不另写一套学习闭环。

---

## 1. 数据模型（新增迁移）

```sql
CREATE TABLE exam_papers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT    NOT NULL,
  kind             TEXT    NOT NULL DEFAULT 'fixed',   -- fixed | timed
  duration_minutes INTEGER,                            -- NULL = 不限时（kind=fixed 时强制 NULL）
  source           TEXT    NOT NULL DEFAULT 'manual',  -- manual | auto
  rules_json       TEXT,                               -- 自动卷的规则快照；手工卷为 NULL
  total_questions  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exam_paper_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id    INTEGER NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  position    INTEGER NOT NULL,        -- 从 1 开始，决定答题顺序
  UNIQUE(paper_id, question_id),
  UNIQUE(paper_id, position)
);

-- 一次作答 = 一条 practice_sessions（复用历史/错题/掌握度/统计）
ALTER TABLE practice_sessions ADD COLUMN paper_id          INTEGER REFERENCES exam_papers(id);
ALTER TABLE practice_sessions ADD COLUMN deadline_at       TEXT;   -- ISO；不限时为 NULL
ALTER TABLE practice_sessions ADD COLUMN exam_submitted_at TEXT;   -- 交卷时间；NULL = 未交卷
ALTER TABLE practice_sessions ADD COLUMN exam_score        REAL;   -- 每题 1 分，= correct/total
```

约定：
- 试卷**归属用户**（`user_id`），跨用户一律 404（不是 403）。
- `practice_sessions.practice_mode = 'exam'`；`practice_logs.origin = 'exam'`（text 列，无枚举约束，需在 schema 注释里补上这个取值）。
- 未作答的题提交时 `status='skipped'`、`is_correct=0`，不进 FSRS/掌握度（沿用现有 skipped 语义）。

## 2. REST 契约（`/api/exam`，JWT）

**已冻结的响应形状**（三个 lane 均已按此实现，改动需三端同步）：
- 列表：`{ data: [...], meta: {limit, offset, total} }`（同 recall/external 口径）；列表项含 `bestScore`(0–1)、`lastScore`(0–1|null)、`lastAttemptAt`(string|null)、`attemptCount`。
- 试卷详情 / 组卷响应：**同形** `{ paper, items:[{position, question}], lastAttempt }`；`lastAttempt = {sessionId, score(0–1), submittedAt} | null`，只算**已交卷**的最近一次。
- 作答详情：`{ paper, questions, answers:[{questionId, userAnswer}], deadlineAt, result? }`；未答的题不出现在 `answers`。
- **分数一律 0–1 小数**（`exam_score`/`bestScore`/`lastScore`/`result.score`），客户端自行格式化成百分比。
- **防作弊**：未交卷时任何响应都不含 `answer`/`explanation`；`GET /papers/{id}` 预览同样不含。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/papers?limit&offset` | 列表 |
| POST | `/papers` | 手工组卷 `{title, kind, durationMinutes?, questionIds:[int]}`（去重；缺 id → 400 列出缺失） |
| GET | `/papers/{id}` | 详情（无答案） |
| PATCH | `/papers/{id}` | 仅 `{title?, kind?, durationMinutes?}`；不含题目编辑（MVP） |
| DELETE | `/papers/{id}` | 已有作答 → 409；否则删除并级联删 items |
| POST | `/papers/generate` | 自动组卷，见 §3；响应与 `GET /papers/{id}` 同形 |
| POST | `/papers/{id}/attempts` | 开始作答 → `{sessionId, paperId, deadlineAt?, questions:[...]}`（题不含答案） |
| GET | `/attempts/{sessionId}` | 作答态/结果态（含 `deadlineAt`，刷新后可恢复倒计时） |
| POST | `/attempts/{sessionId}/submit` | 交卷，见 §4 |

其它：
- 列表/详情的 `question` 字段：`id/content/options(数组)/answer/explanation/tags/dimension/type/material`；`answer` 在**未交卷**的 `GET /attempts/{id}` 里必须置空（防作弊），交卷后返回。
- 全部写路由需要 `authMiddleware`；归属矩阵登记为 `user` 作用域并挂跨用户测试。
- `FEATURES`（`src/lib/contract/version.ts`）追加 `"exam"`，供移动端能力协商。

## 3. 自动组卷规则（`POST /papers/generate`）

```json
{ "title": "教综模考 2026-11-20", "kind": "timed", "durationMinutes": 60,
  "count": 40,
  "tags": ["教育学", "心理学"],            // 可选，限定考点
  "dimensions": ["knowledge","application"], // 可选
  "types": ["single","multi","truefalse"],   // 可选；默认只含客观题
  "excludeRecentDays": 7,                    // 可选，排除近期做过的题
  "weights": { "wrong": 0.3, "weak": 0.3, "fresh": 0.4 } }
```

语义：
1. `wrong` = 该用户做错过的题（`practice_logs.is_correct=0`）；`weak` = 掌握度低的知识点 tag 下的题；`fresh` = 从未作答的题。
2. 按权重取配额，去重后不足则从候选池随机补足；**总数不足 `count` 时返回 400**，body 里给出 `{requested, available, shortfall}`，不要静默缩水。
3. 组卷结果落成一张普通试卷（`source='auto'` + `rules_json` 快照），可重复作答——**不要**做"虚拟试卷"。
4. 只允许客观题（`single/multi/truefalse/fill_blank` 中判分可自动的那些）；主观题（`essay/short_answer`）一律排除。

## 4. 交卷（`POST /attempts/{sessionId}/submit`）

```json
{ "answers": [ { "questionId": 12, "userAnswer": "A", "durationMs": 32000 }, … ],
  "clientKey": "uuid" }
```

- 判分：对每道题调用 `checkAnswerCorrectness(userAnswer, answer, options, type)`（唯一实现），写一条 `practice_logs`（`origin='exam'`、`session_id`、`duration_ms`）。
- 得分：`score = correctCount / totalQuestions`（每题 1 分），写回 `practice_sessions.correct_count/total_duration_ms/exam_score/exam_submitted_at`。
- 超时：`deadline_at` 之后仍接受提交，但返回 `overtimeMs > 0` 且 `overtime: true`。
- **幂等**：`exam_submitted_at` 非空时不再写库，直接从已有 `practice_logs` 重算并返回同一结果，附 `duplicate: true`（`clientKey` 仅作日志/兜底，不作为唯一依据）。
- 未提交的题按 `skipped` 处理。
- 返回：`{score, correctCount, totalQuestions, durationMs, overtimeMs, overtime, duplicate, perQuestion:[{questionId, isCorrect, correctAnswer, explanation}]}`。

## 5. 三端分工

| lane | 范围 | 不得触碰 |
| --- | --- | --- |
| A 服务端 | 迁移、`services/exam.ts`、`routes/exam.ts`、归属矩阵、`FEATURES`、快照、真实依赖集成测试 | `my-next-app/src/app/**`、`mobile_app/**` |
| B Web | `/exam`、`/exam/[id]`、`/exam/session/[id]`、`/exam/result/[id]` + 导航入口；客户端计时与自动交卷；vitest | 迁移/服务层；`mobile_app/**` |
| C 移动端 | `features/exam/{domain,data,presentation}`、路由、首页入口、能力协商灰显；widget/单元测试 | `my-next-app/**`；`app_theme.dart` / `app_icons.dart` |

共用约定：
- Web 端可直接 `fetch('/api/exam/...')`（cookie 认证由 `authMiddleware` 接受），**不再写一套 Server Actions**——理由：移动端必须有 REST，双实现必然漂移；本页只在客户端组件里调用。
- 倒计时以服务端 `deadlineAt` 为准，客户端只做展示；切后台/刷新后仍按服务端剩余时间恢复。
- 交卷必须有"未作答 N 题"确认；超时自动交卷一次。
- 移动端能力协商：`supports('exam')` 为 false 时隐藏入口。

## 6. 验收

服务端：
```bash
npm run typecheck && npm run lint:ci && npx vitest run --maxWorkers=8 && npm run contract:check
```
Web：`npm run lint:ci && npx vitest run`（+ 相关页面用例）。
移动端：`flutter analyze && flutter test && dart run tool/coverage_gate.dart`。

业务验收（真机/真浏览器）：
1. 手工选 10 题建固定卷 → 做一遍 → 历史出现该次、错题本出现错题；
2. 自动组 10 题限时 5 分钟卷 → 倒计时归零自动交卷 → 成绩单正确率正确；
3. 同一试卷再做一次 → 生成**两条**历史（不同 attempt），互不覆盖；
4. 交卷重放（同 sessionId 再 POST）→ `duplicate:true` 且历史仍一条。

## 6.5 已落地的实现事实（2026-11-20）

- **服务端**：`services/exam.ts` + `routes/exam.ts`（9 端点）+ 迁移 `0024`；`FEATURES` 加 `exam`；归属矩阵登记 `user` 域；真实依赖集成测试 16 条（含幂等、超时、跨用户 404、组卷不足 400）。
- **Web**：`src/app/exam/**` 四页 + 组卷弹窗 + 计时 Hook；`/exam` 已进 `middleware` 受保护路由；导航入口在 `AppSidebar`（`nav.exam`：标准「试卷」/ 新中式「模考」）。移动 Web 视口的 `MobileNav` **未加入口**（原生 App 已有，避免 6 个底栏项再挤）。
- **移动端**：`features/exam/{domain,data,presentation}`；首页「试卷」整宽卡，`supports('exam')` 为 false 时隐藏；倒计时以 `deadlineAt` 为准、切前后台重新对表、超时自动交卷只触发一次、交卷载荷冻结重放。
- **门禁基线**（合并后实测）：后端 2024 用例全绿；Flutter 986 通过 / 2 跳过，global **86.1%**、screens **85.3%**。

## 7. 风险

- `practice_logs` 是最大表：交卷一次批量写 N 条，需要事务内批量插入，不要逐条提交。
- 迁移只加列/加表，不改既有列语义；`practice_sessions` 加列后历史行 `paper_id` 为 NULL，正常。
- 自动组卷的"弱项"依赖 mastery 聚合，查询可能慢；先按 tag 取掌握度，再加索引，必要时用 `EXPLAIN QUERY PLAN` 验证。
