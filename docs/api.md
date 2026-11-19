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
| `/questions`、`/questions/batch`                                                    | POST   | `admin`    |
| `/questions/:id`                                                                    | PATCH  | `admin`    |

`admin` 只用于**题库写接口**（建题 / 批量建题 / 改题）：题库是全局共享资产，
write key 能建题等于把所有人的练习内容交给任意 agent，所以按更严的 `admin` 签发。
其余模块没有 admin 专属接口，`admin` 在那些路径上等价于 `write`。

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

## 2. 接口清单（共 29 条）

两套分页口径，注意区分：

- 题库两个接口用 `page` / `limit`（默认 20、上限 100）+ 响应 `pagination{page,limit,total,totalPages}`；
- 其余列表接口用 `limit`（默认 20、上限 100）+ `offset`（默认 0）+ 响应 `meta{limit,offset,total}`。

### 题库（全局共享）

| 方法  | 路径               | 参数                                                | 用途                                   |
| ----- | ------------------ | --------------------------------------------------- | -------------------------------------- |
| GET   | `/questions`       | `page`=1、`limit`=20、`tag`（可选，按标签精确匹配） | 分页拉题库                             |
| GET   | `/questions/:id`   | 路径 `id`                                           | 单题详情；不存在 404                   |
| POST  | `/questions`       | `admin` 作用域，JSON 体见 §11                       | 建题；内容指纹幂等                     |
| POST  | `/questions/batch` | `admin` 作用域，JSON 体见 §11                       | 批量建题（≤100 条）；`externalId` 幂等 |
| PATCH | `/questions/:id`   | `admin` 作用域，部分更新                            | 改题；改后指纹撞别的题返回 409         |

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
| POST   | `/recall/cards/:cardId/archive`         | `write` | 归档：把卡片移出**当前身份**的复习队列（幂等）         |
| DELETE | `/recall/cards/:cardId/archive`         | `write` | 取消归档：放回复习队列（没归档过时 `restored: false`） |

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

### 个人内容（按调用身份隔离）

| 方法 | 路径            | 作用域  | 用途                                                       |
| ---- | --------------- | ------- | ---------------------------------------------------------- |
| GET  | `/notes`        | `read`  | 笔记列表（`limit`、`offset`、`q` 关键词）；只给 200 字预览 |
| GET  | `/notes/:id`    | `read`  | 笔记全文；不存在或不属于本身份一律 404                     |
| GET  | `/mindmaps`     | `read`  | 思维导图列表（`limit`、`offset`）                          |
| GET  | `/mindmaps/:id` | `read`  | 导图内容（`content` 为 Markdown 大纲源文）                 |
| GET  | `/srs/summary`  | `read`  | SRS 复习负载：卡片总量、状态分布、未来 7 天逐日预估        |
| POST | `/srs/reviews`  | `write` | 推进错题 SRS（`answeredAt` 幂等）：外部数据能推动复习队列  |

字段要点：

- `/notes` 每项只有 `{id,title,preview,updatedAt}`——**列表故意不给全文**，避免一次列表请求吃满 agent 上下文；
  要正文用 `/notes/:id`。`q` 在标题与正文里做 LIKE，命中别人的笔记不会返回（归属在 SQL 的 `where` 里判定）。
- `/srs/summary` 给的是"负载"不是"题目"：`totalCards`、`stateDistribution{new,learning,review,relearning}`、
  `learnedCount`、`retention{trueRetention,totalReviews}`、`next7Days{count,minutes}`、`daily[{date,count,minutes}]`。
  具体该做哪几道题用 `/wrong-book` 取。

**时间格式**：`createdAt` / `updatedAt` 一律是 SQLite UTC 文本 `YYYY-MM-DD HH:MM:SS`（不带 `T`/`Z`），
按 UTC 解析即可。导图更新曾写 ISO 8601，导致同一列混两种格式、按字符串排序会失真，已统一。

**`/srs/summary` 与 `/wrong-book` 的口径差异**（有意保留，不要按一个去改另一个）：

- `/srs/summary` 是 **SRS 引擎视角的负载**：统计所有进入 `question_srs` 的题，包含被标记
  "已掌握"的题——它们在调度器里仍然占着到期日；
- `/wrong-book` 是 **实际待练清单**：排除 `mastered_questions` 里已掌握的题。

所以 `next7Days.count` 可能大于你在 `/wrong-book` 里实际取到的题数。要"今天该练什么"用
`/wrong-book`；要"复习压力有多大"用 `/srs/summary`。

`/srs/reviews` 请求体：`{ questionId, isCorrect, durationMs?, userAnswerLength?, answeredAt? }`，
返回 `{ questionId, dueDate, stability, difficulty, reps, lapses, state, duplicate }`；
`answeredAt` 兼作幂等键（同一时间重试不二次推进，读-判-写在同一条事务里串行执行）。
归档接口 `POST/DELETE /recall/cards/:cardId/archive` 只影响调用身份，取消归档返回
`restored:false` 表示本来就没归档过（不是错误）。

**为什么补这三个**：此前笔记、导图、SRS 负载只有 Server Action（浏览器界面用），agent 拿不到。
补完之后「关掉浏览器只靠本文档」可完成的任务从 4 类扩到 7 类（题库、练习、错题、复习、笔记、导图、学情）。

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
   题库写接口（`POST /questions`、`POST /questions/batch`、`PATCH /questions/:id`）需要 **admin** 作用域，
   没有 admin key 时不要尝试，停下来报告。
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
- **写接口现状**（共 11 条）：`POST /practice/answers`、`POST /recall/reviews`、`POST /recall/decks`、
  `POST /recall/cards`、`DELETE /recall/decks/:deckKey/cards/:cardKey`、
  `POST /recall/cards/:cardId/archive`、`DELETE /recall/cards/:cardId/archive`、`POST /srs/reviews`、
  `POST /questions`、`POST /questions/batch`、`PATCH /questions/:id`。
  **题库写接口需要 `admin` 作用域**（题库是全局资产，write key 不能改），且**不提供删除**：
  删题会连带删掉所有人的作答与复习记录，没有可撤回的路径，暂时只在后台做。
- **导入与 SRS 是两条路**：`POST /practice/answers` 只写会话/日志/掌握度，**不触发 SRS**；
  要让错题进入复习队列必须显式调用 `POST /srs/reviews`。这样"记录作答"与"安排复习"可以分开决定。
- **回忆卡的归档是「按身份」的**：`POST/DELETE /recall/cards/:cardId/archive` 只改调用身份的队列，
  不动卡片内容与别人的进度。
- **回忆卡的删除是全局的**：卡片内容共享，DELETE 会连所有人的进度与作答日志一起删掉，且无法撤回。
  删除回执带 `reviewLogs` / `cardStates`（本次连带删掉的行数）；**动手前先用 §9 的 dry-run 看一眼**。
- **限流按 API Key 计**（不按 IP——agent 常共用出口 IP）：读 600 次/分钟、写 120 次/分钟，
  超限返回 `429` + `Retry-After`（body 里同时给 `retryAfter` 秒数）。被限流不影响其他 key。
- **限流配额是「单实例」的**：计数存在进程内存里，多实例部署时各自独立计数 ——
  同一把 key 在实例 A 用完额度，实例 B 仍可能接受请求。总配额 = 实例数 × 上表额度。

## 9. dry-run：写接口的预演

5 个写接口都支持 `?dryRun=true`（query 参数，DELETE 同样适用）：

| 接口                                           | 预演返回什么                                                             | 业务数据变更 |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ------------ |
| `POST /practice/answers`                       | `inserted`（会写几条日志）、题目校验结果                                 | 零           |
| `POST /recall/reviews`                         | `verdicts` / `rating` / `nextDue` / `pendingItems`（真实判分与调度计算） | 零           |
| `POST /recall/decks`                           | `createdCards` / `updatedCards` / `skippedCards` / `conflicts`           | 零           |
| `POST /recall/cards`                           | `cardId` / `created`（新建还是覆盖）                                     | 零           |
| `DELETE /recall/decks/:deckKey/cards/:cardKey` | `reviewLogs` / `cardStates`（会连带删掉多少行），`deleted` 为 `false`    | 零           |

"业务数据"指会话、答题日志、掌握度、卡组/卡片、复习进度 —— 一个字节都不变。
**不变的不包括** `api_keys.last_used_at`（每次调用刷新）与 `api_audit_logs`（写请求照常留痕），
所以"预演零写入"要读成"业务数据零写入"，不是"数据库零写入"。

三条语义保证：

1. **计数与真执行同源**：服务端在真实事务里跑完真实写入路径后强制回滚，
   不是另写一套预演逻辑，所以不会出现「预演说 3 条、真写 5 条」。
2. **错误照常暴露**：预演同样会报 `400`（题目不存在，带 `invalidQuestionIds`）、
   `404`（卡组/卡片不存在）、`403`（作用域不足）。预演通过 = 真请求不会因为参数被拒。
3. **响应多一个 `dryRun: true`**：用于区分"这是预演"与"已生效"；
   `DELETE` 的 `deleted` 在预演时是 `false`，别把它当成功。

幂等键在预演里同样生效。四种组合各自有明确标记，按 `duplicate` → `dryRun` 的顺序读：

| `duplicate` | `dryRun` | 含义                                  |
| ----------- | -------- | ------------------------------------- |
| 无          | 无       | 真的写进去了                          |
| `true`      | 无       | 真提交命中幂等键，本次没有写入        |
| 无          | `true`   | 预演通过，什么都没写                  |
| `true`      | `true`   | 预演 + 命中幂等键（预演本来也不会写） |

### 预演不是承诺，只是「此刻的快照」

预演与正式请求是**两次独立请求**，中间状态会变。三条必须知道的边界：

- **计数会漂移**：预演看到「将删除 3 条日志」，若另一位用户在这之间又复习了一次同一张卡，
  正式删除会删掉 4 条。**以正式请求执行时的数据为准**，预演数字只用于判断影响面量级。
- **参数会被重新校验**：预演通过不代表正式请求一定通过。例如卡片在两次请求之间被编辑成只剩 1 个条目，
  带 `overrides: [{index: 1}]` 的正式提交会返回 `400`（下标越界）。
- **幂等重放与预演可叠加**：命中 `clientKey` / `sessionKey` 时，真提交只回 `duplicate: true`；
  带 `?dryRun=true` 的重放回 `duplicate: true` **且** `dryRun: true`。按上表的四象限读即可。

## 10. MCP 接入（给 agent 客户端）

`mcp-server/` 把上面这些端点包成 MCP 工具，供 dsh 等客户端挂载（stdio 传输，不改后端）：

```bash
cd mcp-server && npm install && npm run build
AI_LEAMING_BASE_URL=https://your-host AI_LEAMING_API_KEY=sk_xxx node dist/index.js
```

- 工具清单的唯一事实源是 `mcp-server/tools.json`；`npm run mcp:check` 会拿它对照本文生成的
  `docs/openapi.json`，路径/方法/参数任一处漂移，CI 直接红。
- 写工具都透传 `dryRun`；`delete_recall_card` 的描述里要求「先预演、报数字、再确认」。
- 领域使用规约（选哪个工具、错误怎么读、什么时候必须先预演）写在
  [`skills/ai-leaming/SKILL.md`](../skills/ai-leaming/SKILL.md)。

## 11. 题库写接口（`admin` 作用域）

题库是**全局共享资产**：所有 key 都能读，但只有 `admin` 能写。`write` key 调这两个接口一律 403。

### 建题：`POST /questions`

```json
{
  "content": "下列哪项属于教育法律？",
  "options": ["《教育法》", "《教师手册》", "《课程标准》", "《教学计划》"],
  "answer": "A",
  "explanation": "《教育法》是全国人大制定的教育基本法律。",
  "tags": ["教育法规"],
  "dimension": "knowledge",
  "type": "single"
}
```

- `answer`：单选传标号（`A`）或选项原文；多选传 JSON 数组字符串（`"[\"A\",\"B\"]"`）；
  判断题 `A`/`B` 且 `options` 必须两个；填空题 `options` 可为空、`answer` 为自由文本。
- 校验口径与后台导入**完全一致**（同一个 `QuestionSchema`），不合法返回 `400` + `issues`。
- **唯一的刻意差异**：`dimension` 只接受 `knowledge` / `understanding` / `application` 三档
  （后台的 schema 允许任意字符串）。外部 agent 拿不到你们内部的维度命名，放开只会写出
  统计口径之外的脏值；真要扩维度，先扩枚举再放开。
- `400` 有两种形状：处理器内的语义校验是 `{ error, issues: string[] }`；路由层的类型校验
  （字段类型不对）沿用框架默认响应。按 `issues` 判定的客户端请以第一种为准。
- **幂等键 = 内容指纹** `api:` + (题干 + 选项 + 答案)。同一份内容重复提交返回既有 `id` 且
  `duplicate: true`，不新增行；改了选项顺序/答案/题干就是另一道题。
- 预演：`?dryRun=true` 返回 `{ duplicate, externalId, dryRun: true }`，**题库业务数据零变更**
  （审计日志与 `api_keys.last_used_at` 照常写入，与 §9 的口径一致）。
  未命中时 `id` 为 `null`（不是 0），不要拿它去调查详情接口。

响应：`{ id, externalId, duplicate }`。新建成功后会异步重建该题的检索向量（不阻塞响应）。

### 批量建题：`POST /questions/batch`

给"手里有成百道题、且知道上游题号"的场景用（如粉笔导出件）。路径单独一条而不是给
`POST /questions` 加数组——单题与批量的 body 形状、幂等键、回执都不同，混在一起契约说不清。

```json
{
  "questions": [
    {
      "externalId": "jz1680_jz00312",
      "content": "下列哪项属于教育法律？",
      "options": ["《教育法》", "《教师手册》", "《课程标准》"],
      "answer": "A",
      "explanation": "《教育法》是全国人大制定的教育基本法律。",
      "tags": ["教育法规"],
      "type": "single",
      "dimension": "knowledge",
      "source": "jz1680",
      "material": "材料原文（可选）"
    }
  ]
}
```

- **作用域是 `admin`**（与单题建题一致）；`write` / `read` key 一律 403。
- 条数 1–100（`questions` 数组）；逐条校验复用 `QuestionSchema`（与后台导入、单题建题同一口径），
  即 `explanation` 至少 5 个字符、`tags` 至少 1 个，两者**必填**；
  `type` 省略按 `single`、`dimension` 省略按 `knowledge` 落库。
- **整批原子**：任一条不合法返回 `400` + `issues`（每个 issue 前缀带条目下标，
  如 `questions.1.answer: …`），**一条都不写**；`issues` 最多回 20 条，总数见 `issueCount`。
  **结构校验失败（缺必填字段 / 类型不对）返回同一个形状**（`questions.<index>.<path>: <message>`），
  不会回框架默认的 `{success:false,error:{issues}}`——调用方只需写一套 400 解析。
- **幂等**：每条优先用 `externalId`（上游题号，跨重试稳定）；省略时退回内容指纹
  `api:`+（题干+选项+答案）。命中既有题 → `status: "skipped"` 并回既有 `questionId`，
  **不更新内容**（要改题走 `PATCH /questions/{id}`）。
  `externalId` **不能以 `api:` 开头**：该前缀是服务端内容指纹的保留命名空间，
  调用方占用它会在 `PATCH` 时被当成自有指纹重算、悄悄覆盖掉幂等键（返回 400 + `issues`）。
- **批内重复 `externalId`**：第一份 `created`，其余 `skipped` 并指向同一个 `questionId`，
  库内只落一行；此时以**第一份**的内容为准。
- 预演：`?dryRun=true` 时只查不写，`created` 表示「会新建几条」、新题的 `questionId` 为 `null`
  （不要拿它去调查详情接口）；已有题照常回既有 id。

响应：`{ created, skipped, items: [{ index, externalId, questionId, status }], duplicate }`：

| 字段         | 含义                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| `index`      | 该条在请求 `questions` 里的下标（从 0 开始）                           |
| `externalId` | 实际使用的幂等键（没传 `externalId` 时是内容指纹）                     |
| `questionId` | 落库或命中的题目 id；预演且需新建时为 `null`                           |
| `status`     | `created` = 本次新建；`skipped` = 命中既有题或批内重复（内容未被修改） |
| `duplicate`  | `true` = 整批没有新建任何题（全部重复）                                |

新建成功的题会异步重建检索向量（不阻塞响应）。

### 改题：`PATCH /questions/:id`

- 部分更新，只改传了的字段；合并后仍要整体满足 `QuestionSchema`，否则 `400` + `issues`。
- 改题干/选项/答案会重算指纹；若新指纹与**另一道题**相同，返回 `409` 并给出 `conflictingId`
  ——不静默合并，避免两道不同的题被吞成一份。
- 只改解析/标签/维度不会改变指纹，也不会重建向量。
- 预演：`?dryRun=true` 返回 `{ changed: ["content", ...], externalId, dryRun: true }`。

### 为什么没有删除接口

删题会连带删掉所有人的作答日志、错题与复习进度，且无法撤回。这个操作目前只留在后台
由人工执行；对外暴露删除需要先有软删除/回收站，不在当前范围内。
