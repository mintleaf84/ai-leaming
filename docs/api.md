# Agent API：让 AI agent 调用本站数据

一句话定位：`/api/external/*` 是给 **AI agent / 脚本** 用的 REST API，用 API Key 鉴权；
浏览器用的 session cookie 鉴权（`authMiddleware` / `/api/me` 那条链路）对它**不适用**，
不要带 cookie，也不要试图先登录再调用。

- Base：`https://<站点域名>/api/external`
- 机读契约：`GET /api/openapi.json`（无需鉴权，含全部路由与 schema）；可视化在 `/api/doc`
- 挂载点：`src/app/api/[[...route]]/route.ts` 的 `basePath("/api")` + `app.route("/external", …)`

## 1. 鉴权

```http
Authorization: Bearer sk_xxxxxxxx
```

- 解析规则：正则 `^Bearer\s+(.+)$`（`Bearer` 大小写不敏感），取到 token 后按 `api_keys.key_string` 精确匹配。
- 作用域 `scopes` 三档，**递进包含**：`read` ⊂ `write` ⊂ `admin`（`SCOPE_RANK`）。
- key 由站长在后台生成（`server/actions/api-keys.ts`：`description` / `scopes` / 可选 `userId`）；
  `userId` 留空即「全局 key」，见第 4 节。

### 能力矩阵

| 接口                                                                                | 方法   | 最低作用域 |
| ----------------------------------------------------------------------------------- | ------ | ---------- |
| `/questions`、`/questions/:id`                                                      | GET    | `read`     |
| `/practice/sessions`、`/practice/sessions/:id`                                      | GET    | `read`     |
| `/wrong-book`、`/wrong-book/stats`                                                  | GET    | `read`     |
| `/mastery`、`/stats`、`/knowledge/cards`                                            | GET    | `read`     |
| `/recall/decks`、`/recall/decks/:deckKey`、`/recall/cards/:cardId`、`/recall/queue` | GET    | `read`     |
| `/practice/answers`                                                                 | POST   | `write`    |
| `/recall/reviews`、`/recall/decks`、`/recall/cards`                                 | POST   | `write`    |
| `/recall/decks/:deckKey/cards/:cardKey`                                             | DELETE | `write`    |

当前**没有** admin 专属的外部接口：`admin` 在本 API 中等价于 `write`。

### 状态码语义（不要混用）

| 码  | 含义                                                                                                                                                                                     | 响应体                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200 | 成功（写接口幂等命中也是 200）                                                                                                                                                           | 见各接口                                                                                                                                                   |
| 400 | 请求体不符合 schema（zod 默认结构 `{"success": false, "error": {"issues": [...]}}`）；`answers` 里有题库中不存在的 `questionId`；回忆卡组内容校验失败（`issues` 来自 `parseRecallDeck`） | `{"error": "以下 questionId 不存在：…", "invalidQuestionIds": [1,2]}`（最多回前 5 个）或 `{"error": "卡组内容校验失败", "issues": [...], "issueCount": 3}` |
| 401 | 缺少 / 格式不对 / 无效 / **已停用**（`is_active != 1`）的 key                                                                                                                            | `{"error": "缺少 Authorization: Bearer <key>"}` 或 `{"error": "API Key 无效或已停用"}`                                                                     |
| 403 | key 有效，但作用域不足                                                                                                                                                                   | `{"error": "该 key 的作用域不足（需要 write）"}`                                                                                                           |
| 404 | 资源不存在 **或不属于当前身份**（会话 / 卡组 / 卡片）                                                                                                                                    | `{"error": "练习会话不存在"}` / `{"error": "卡组不存在：deck-1"}`                                                                                          |
| 500 | 鉴权查询失败或服务端故障                                                                                                                                                                 | `{"error": "服务器内部错误"}`                                                                                                                              |

**404 是刻意的**：访问他人会话一律 404 而不是 403——403 等于告诉对方「这个 id 存在」。

## 2. 接口清单（共 18 条）

两套分页口径，注意区分：

- 题库两个接口用 `page` / `limit`（默认 20、上限 100）+ 响应 `pagination{page,limit,total,totalPages}`；
- 其余列表接口用 `limit`（默认 20、上限 100）+ `offset`（默认 0）+ 响应 `meta{limit,offset,total}`。

### 题库（全局共享）

| 方法 | 路径             | 参数                                                | 用途                 |
| ---- | ---------------- | --------------------------------------------------- | -------------------- |
| GET  | `/questions`     | `page`=1、`limit`=20、`tag`（可选，按标签精确匹配） | 分页拉题库           |
| GET  | `/questions/:id` | 路径 `id`                                           | 单题详情；不存在 404 |

单题字段：`id`(number)、`type`(string|null)、`dimension`(string|null)、`content`、`options`(string[])、
`answer`(string)、`explanation`(string|null)、`tags`(string[])。

### 练习记录（按调用身份隔离）

| 方法 | 路径                     | 参数                              | 用途                           |
| ---- | ------------------------ | --------------------------------- | ------------------------------ |
| GET  | `/practice/sessions`     | `limit`、`offset`、`mode`（可选） | 会话列表，按开始时间倒序       |
| GET  | `/practice/sessions/:id` | 路径 `id`（会话 ID，字符串）      | 单场详情 + 逐题作答            |
| POST | `/practice/answers`      | JSON 体，见第 3 节                | 导入一批答题记录（唯一写接口） |

`/practice/sessions` 每项：`id`(string)、`name`(string|null)、`mode`(string|null)、
`totalQuestions`、`correctCount`、`accuracy`(0–100 整数)、`startedAt`（SQLite `CURRENT_TIMESTAMP` 文本，
形如 `2026-11-13 08:00:00`，UTC，**不带 `T`/`Z`**，解析时按 UTC 处理）。

`/practice/sessions/:id` 返回：

- `session`：同上结构；
- `questions[]`：`questionId`、`content`、`options`、`userAnswer`、`correctAnswer`、`isCorrect`、`durationMs`、`tags`；
- `summary`：`totalQuestions`、`correctCount`、`accuracy`、`totalDurationMs`。

### 错题本

| 方法 | 路径                | 参数                             | 用途                                      |
| ---- | ------------------- | -------------------------------- | ----------------------------------------- |
| GET  | `/wrong-book`       | `limit`、`offset`、`tag`（可选） | 未掌握的错题，按错误次数/最近错误时间倒序 |
| GET  | `/wrong-book/stats` | 无                               | 错题总数、按标签、按维度分布              |

`/wrong-book` 每项：`questionId`、`content`、`tags`、`wrongCount`、`lastWrongAt`、
`srs`（`{stability, difficulty, dueDate}` 或 `null`，null 表示还没进复习队列）。

`/wrong-book/stats` 返回 `total`、`byTag[{tag,count}]`、`byDimension[{dimension,count}]`
（`dimension` 缺失时是字符串 `"unknown"`）。统计口径与列表一致：**都已排除已掌握题目**。

### 掌握度 / 总览 / 知识卡片

| 方法 | 路径               | 参数                                  | 用途                           |
| ---- | ------------------ | ------------------------------------- | ------------------------------ |
| GET  | `/mastery`         | `limit`、`offset`                     | 每个标签的掌握度，按标签名升序 |
| GET  | `/stats`           | 无                                    | 学习总览                       |
| GET  | `/knowledge/cards` | `limit`、`offset`、`category`（可选） | 知识卡片，按创建时间倒序       |

- `/mastery` 每项：`tag`、`score`(0–100)、`correctCount`、`totalCount`、`accuracy`(0–100)、`lastUpdated`(string|null)。
- `/stats`：`totalAnswered`、`totalCorrect`、`accuracy`、`totalSessions`、`streakDays`、`averageMastery`、
  `todayAnswered`、`todayCorrect`、`pendingReviewCount`、`observationZoneCount`、`weakPoints[{tag,score}]`。
- `/knowledge/cards` 每项：`id`、`title`、`category`（缺失时为空串）、`tags`、`front`、`back`、
  `keyPoints[{term,definition}]`、`createdAt`(string|null)。

### 回忆自测（Recall）

回忆自测的**卡组与卡片内容全局共享**（谁导入的都一样），**复习进度与作答日志按调用身份隔离**。
所有 `cardId` 数字参数都是卡片**主键**，不是文件里的 `cardId` 字符串（后者在响应里叫 `cardKey`）。

| 方法   | 路径                                    | scope   | 用途                                                   |
| ------ | --------------------------------------- | ------- | ------------------------------------------------------ |
| GET    | `/recall/decks`                         | `read`  | 卡组列表 + 当前身份的进度统计（`limit`、`offset`）     |
| GET    | `/recall/decks/:deckKey`                | `read`  | 卡组详情 + 卡片列表（`limit`、`offset`）               |
| GET    | `/recall/cards/:cardId`                 | `read`  | 单卡详情 + `mode` + `pendingItems`                     |
| GET    | `/recall/queue`                         | `read`  | 今日队列 `ids`（到期优先 + 新卡）+ 估时 + 连续天数     |
| POST   | `/recall/reviews`                       | `write` | 提交一次作答（判分 + 调度 + 落日志），`clientKey` 幂等 |
| POST   | `/recall/decks`                         | `write` | 导入卡组（`json` 字符串，`onConflict=keep\|accept`）   |
| POST   | `/recall/cards`                         | `write` | 新建 / 修改单卡                                        |
| DELETE | `/recall/decks/:deckKey/cards/:cardKey` | `write` | 删除单卡（连同其作答日志与所有人的进度）               |

字段要点：

- `/recall/decks` 每项：`deckKey`、`title`、`cardCount`（卡组内卡片总数）、`activeCount`（本人未归档且有状态）、
  `archivedCount`（本人已归档）、`dueCount`（本人当前到期）。`activeCount` / `archivedCount` / `dueCount` 只统计**调用身份**。
- `/recall/decks/:deckKey` 返回 `deck{deckKey,title,groups[]}`、`data[]`（每张卡 `cardId`、`cardKey`、`kind`、
  `groupKey`、`prompt`、`items`/`blanks`、`verbatim`、`state`）、`meta{limit,offset,total}`。
  `state` 为 `null` 表示该身份从未复习过这张卡；有记录时为 `{due,stability,difficulty,state,reps,lapses,last_review,pendingItems,archived}`。
- `/recall/cards/:cardId` 额外返回 `mode`（`first` = 首次作答整卡；`retest` = 只重测 `pendingItems` 里的条目）
  与 `pendingItems`（卡内条目下标；`null` 表示没有待重测条目）。
- `/recall/queue`：`ids` 是本次要做的卡片主键序列（**顺序即建议作答顺序**：到期卡按 `due` 升序在前，今天的新卡在后）；
  `due` / `fresh` 是**条数**而不是 id 数组；`total = due + fresh`；新卡每日额度默认 6（用户设置可调 0–15），
  当日总量上限 15；`streakDays` 按学习日（Asia/Shanghai 04:00 切换）统计。
- `/recall/reviews` 请求体：`{ cardId, typed, allBlank?, overrides?: [{index,to:"ok"|"miss"}], clientKey? }`；
  响应：`{ verdicts, rating: "again"|"hard"|"good", nextDue, pendingItems, nextReviewText, duplicate }`。
  `verdicts` 与本次呈现的条目一一对应；`nextReviewText` 可直接展示（如 `下次 11 月 20 日`、`明天只重测这 2 条`）。
- `/recall/decks` 请求体：`{ json: "<卡组文件 JSON 字符串>", onConflict?: "keep"|"accept" }`；
  响应与界面导入一致：`deckKey`、`createdCards`、`updatedCards`、`skippedCards`、`conflicts[{cardId,action}]`、`missingInFile[]`。
  同一份文件重复导入**零写入**；`schema` 版本只接受 `1`，其他版本 400 且库内零写入。
- `/recall/cards` 请求体：`{ deckKey, cardId, prompt, kind, items?, blanks?, verbatim?, groupId? }`；
  `kind=list` 用 `items`（1–6 条，每条 `{text,keywords[]}`，`keywords` 至少 1 个），`kind=cloze` 用 `blanks`
  （每空 1–3 个可接受答案）；不传 `verbatim` / `groupId` 表示沿用库内旧值，`groupId: null` 表示移出分组。

**幂等（`clientKey`）**：提交作答时客户端必须为每次作答生成一个 UUID 并在所有重试中沿用。
服务端按 `(user_id, clientKey)` 判定重放：命中时返回首次结果且 `duplicate: true`，**不写新日志、不二次推进调度**
（因此 `reps` 不会翻倍）。改内容必须换新 key，否则新作答会被当成重放丢弃。

```bash
# 提交一次作答（write key；clientKey 用于跨重试幂等）
curl -s -X POST "$BASE/api/external/recall/reviews" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "cardId": 42,
    "typed": "1. 建立安全制度 2. 开展安全演练",
    "clientKey": "6f1c1d5e-2a4b-4f0e-9c2f-8f0a2d1b7c33"
  }'
```

## 3. 幂等：`sessionKey`

`POST /practice/answers` 的幂等键由**调用方**生成，服务端落库时写成 `source_key = "agent:" + sessionKey`。

```json
{
  "sessionKey": "agent-run-2026-11-13-a",
  "sessionName": "由 agent 导入",
  "answers": [
    {
      "questionId": 123,
      "userAnswer": "A",
      "isCorrect": true,
      "durationMs": 12000
    },
    { "questionId": 456, "isCorrect": false }
  ]
}
```

- 同身份（`user_id`）+ 同 `sessionKey` 重复提交 → `{"sessionId": "...", "inserted": 0, "duplicated": true}`，
  **不再写答题日志、不再累加掌握度**。
- 幂等范围是**同一用户**：唯一索引建在 `(user_id, source_key)` 上，不同用户用同一个 `sessionKey` 互不影响。
- 服务端统一加 `agent:` 前缀，与粉笔导入共用 `source_key` 命名空间也不会撞车。
- 并发撞车由唯一索引兜底，同样返回 `duplicated: true`。
- 因此：**重试要复用同一个 key，改内容必须换新 key**，否则新数据会被当成重复丢掉。
- 返回：`sessionId`（会话 ID）、`inserted`（本次写入条数，幂等命中为 0）、`duplicated`(boolean)。
- `answers` 1–500 条；`questionId` 必须是题库中存在的题，否则整批 400（不做部分写入）；
  `isCorrect` 必填且**由调用方判定**，服务端不会用标准答案重算。

## 4. 数据隔离

- 所有读接口用解析后的 `identity.effectiveUserId` 过滤，用户 key 只能看到自己的数据。
- `api_keys.user_id IS NULL` 是**全局 key**：操作身份解析为 `API_GLOBAL_USER_ID`（缺省 1，站长账号），
  等价站长身份——**不要分发**。全局 key 仍受 `scopes` 限制（未升级的 key 默认 `read`，调写接口 403）。
- 越权访问他人资源：404，不区分「不存在」与「无权」。

## 5. 审计

- 只记写方法（`POST` / `PATCH` / `PUT` / `DELETE`），读请求不入库。
- 落库 `api_audit_logs`：`key_id`、`user_id`、`method`、`path`（含 `/api/external` 前缀）、`status`、`duration_ms`、`created_at`。
- 已认证但越权（403）**会记**；完全匿名（401）不记，避免刷请求把表灌满。
- 审计走 `after()` 旁路，写入失败只落日志，不影响本次响应。

## 6. 三个可直接复制的调用

```bash
BASE=https://<站点域名>
KEY=sk_xxxxxxxx

# 1) 拉最近 5 条练习记录
curl -s "$BASE/api/external/practice/sessions?limit=5&offset=0" \
  -H "Authorization: Bearer $KEY"

# 2) 拉错题本（按标签筛选，最多 100 条）
curl -s "$BASE/api/external/wrong-book?limit=100&tag=教育心理学" \
  -H "Authorization: Bearer $KEY"

# 3) 导入一批答题记录（需 write key；sessionKey 用于重试去重）
curl -s -X POST "$BASE/api/external/practice/answers" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionKey": "agent-run-2026-11-13-a",
    "sessionName": "agent 模拟练习",
    "answers": [
      { "questionId": 123, "userAnswer": "A", "isCorrect": true, "durationMs": 12000 },
      { "questionId": 456, "userAnswer": "C", "isCorrect": false }
    ]
  }'
```

## 7. 给 agent 的提示词模板

```markdown
你可以调用本站的 REST API。规则：

1. 先读 `GET /api/openapi.json`，据其中的 paths/schema 自己生成调用代码，不要凭记忆猜字段。
2. 所有请求带 `Authorization: Bearer $API_KEY`；cookie 对本 API 无效，不要尝试登录。
3. 只读接口（GET）可直接调用；写接口需要 write 作用域：`POST /api/external/practice/answers`、
   `POST /api/external/recall/reviews`、`POST /api/external/recall/decks`、`POST /api/external/recall/cards`、
   `DELETE /api/external/recall/decks/:deckKey/cards/:cardKey`。
4. 写操作必须自带幂等键：练习导入用 `sessionKey`，回忆作答用 `clientKey`；同一次任务的重试沿用同一个 key，
   内容变了才换新 key。收到 `duplicated: true` / `duplicate: true` 表示之前已写入成功，不要再重试。
5. 遇到 404 不要重试：它表示资源不存在或不属于当前 key 的数据；
   遇到 401 说明 key 缺失/无效/已停用，停下来报告；403 说明作用域不足，不要换参数硬试。
6. 分页有两套：**题库** `/questions` 用 `page` + `limit`，看响应里的 `pagination.totalPages`；**其余列表** 用 `limit`（≤100）+ `offset`，看 `meta.total`。写通用翻页逻辑时必须分支，否则题库会一直拿第一页。
7. 每批导入不超过 500 条，`isCorrect` 必须由你判定后显式传入。
8. 本轮结束后汇报：导入了多少条、`sessionId`、以及是否命中幂等（duplicated）。
```

## 8. 已知边界

- **题库全局共享**：`questions` 表没有 `user_id`，任何有效 key 都能读全量题库（含 `answer` 与 `explanation`）。
- **导入不触发 SRS**：`POST /practice/answers` 只写会话 / 答题日志 / 掌握度，不写 `question_srs`，
  复习队列与 `dueDate` 不会被这批数据推动。
- **写接口单批上限 500 条**（schema `max(500)`），且题目校验是整批原子的：有一道不存在就全部不写。
- **`isCorrect` 以调用方为准**：服务端不比对标准答案，传错会直接污染掌握度与错题本。
- **两套分页口径**（题库 `page/pagination`，其余 `limit/offset/meta`），写通用翻页逻辑时要分开处理。
- **写接口现状**：`POST /practice/answers`、`POST /recall/reviews`、`POST /recall/decks`、`POST /recall/cards`、
  `DELETE /recall/decks/:deckKey/cards/:cardKey`。**题库写接口**（增/改/删题）与**`question_srs` 写入**仍未开放：
  外部数据推动不了错题的复习队列。
- **回忆自测没有归档 / 取消归档接口**：只有读、作答、导入、建改删卡；归档目前只在浏览器界面里操作。
- **回忆卡的删除是全局的**：卡片内容共享，DELETE 会连所有人的进度与作答日志一起删掉，且无法撤回。
- **无限流**：`/api/external/*` 没有 rate limit 中间件（只有 `/api/auth` 有），高频轮询会直接压到数据库。
