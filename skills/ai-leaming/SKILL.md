---
name: ai-leaming
description: 用 ai-leaming 的 MCP 工具驱动教招刷题——查题库、导入作答、看学情与错题、推进复习队列。当用户要求「按我的错题安排今天练什么」「把这批作答记进去」「看看我哪块最弱」时使用。
---

# ai-leaming 刷题助手

这是一个**教师招聘考试客观题**刷题系统。它不生成题目讲评，只负责题库、作答、掌握度与间隔复习。

## 先决条件

- 已挂载 `ai-leaming` MCP server（11 个工具）。
- key 的作用域决定能做什么：`read` 只能查，`write` 才能导入作答/提交复习/删卡。
  遇到 `403` 说明 key 不够，不要重试，直接告诉用户去换一把 write key。

## 工具选择（别只用一两个）

| 用户想做什么 | 用哪个 | 别用什么 |
| --- | --- | --- |
| 「今天练什么」 | `get_wrong_book`（实际待练，排除已掌握） | `get_recall_queue` 是回忆卡队列，不是错题 |
| 「我哪块最弱」 | `get_mastery` + `get_overview` 的 `weakPoints` | 不要用 `get_overview` 的平均分单独下结论 |
| 「这题为什么错」 | `get_question`（含 `answer`/`explanation`） | 不要 `list_questions` 翻页找 |
| 记录一批作答 | `import_answers` | — |
| 安排/推进错题复习 | `get_wrong_book` → 教学 → `submit_review`（注意：`submit_review` 是**回忆卡**作答，错题 SRS 走 `/srs/reviews` REST） | — |

## 三条硬规矩

1. **写之前先预演**：所有写工具都支持 `dryRun: true`。改数据前先预演一次，把「会写入多少条 / 会删掉多少」报给用户，得到确认后再真发。
2. **重试必须复用幂等键**：`import_answers` 的 `sessionKey`、`submit_review` 的 `clientKey`，同一次任务的所有重试必须用同一个值。换了 key = 新的数据。
3. **删卡不可撤回**：`delete_recall_card` 是全局删除（连别人的进度一起删）。必须 `dryRun` 预演、把 `reviewLogs` / `cardStates` 念出来、明确得到「确认删除」再执行。

## 错误怎么读

| 状态 | 含义 | 该怎么做 |
| --- | --- | --- |
| `400` | 参数错（如 `questionId` 不存在） | 改参数重发，`invalidQuestionIds` 会列出不存在的 id |
| `401` | key 无效/停用 | 让用户重新签发，不要重试 |
| `403` | 作用域不足（需要 write） | 让用户换 key，不要重试 |
| `404` | 资源不存在（或不属于该 key 的身份） | 不要换 id 猜，先问用户 |
| `429` | 限流（读 600/分、写 120/分，**单实例**配额） | 按 `Retry-After` 或 `body.retryAfter` 等待，不要立刻重试 |
| 网络错误 | 可能已写入 | 用同一个幂等键重试，不会重复计 |

## 一次完整的「今天练什么」

1. `get_overview` —— 拿连续天数、平均掌握度、薄弱点；
2. `get_wrong_book`（`limit: 20`）—— 拿实际待练错题；
3. `get_mastery` —— 定位最弱的两三个标签，从错题里挑对应题；
4. 输出一份「今天 20 分钟能做完」的清单：题目 id + 知识点 + 为什么现在练它；
5. 用户做完后 `import_answers`（先 `dryRun` 报数，再真发）。

**不要**在这一步直接调 `submit_review`：那是回忆卡（主动回忆）的作答，错题练习是另一条链路。
