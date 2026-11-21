# 粉笔（fenbi）账号同步设计

> 状态：接口事实已于 2026-11-21 实测（真实账号，非推测）。本文是后端 / Web / App 三条 lane 的共同契约，改动前先改这里。

## 1. 目标

用户在 ai-leaming 绑定自己的粉笔账号（扫码或账号密码），把粉笔里的**做题记录**同步进来，落到既有的 `practice_sessions` + 作答链路，从而自动产生练习历史 / 错题本 / 掌握度。

硬约束：

1. **不重复导入**。用户此前用油猴脚本手工推过（`source_key` 幂等）、也用 1680 题 PDF 通道建过题，同步必须绕过这两批。
2. Web 与 App 都能用（同一套 API）。
3. 用户不抓包——登录只走「扫码」或「手机号+密码」。

## 2. 已实测的接口事实

### 2.1 登录（账号密码）

```
POST https://login.fenbi.com/api/users/loginV2?kav=12&app=web&av=80
Content-Type: application/x-www-form-urlencoded

phone=<11位手机号>
password=<RSA/PKCS#1 v1.5 加密后 base64>
persistent=true
app=web
```

- RSA 公钥（写死在前端，base64，模数 128 字节，e=65537）：

```
ANKi9PWuvDOsagwIVvrPx77mXNV0APmjySsYjB1/GtUTY6cyKNRl2RCTt608m9nYk5VeCG2EAZRQmQNQTyfZkw0Uo+MytAkjj17BXOpY4o6+BToi7rRKfTGl6J60/XBZcGSzN1XVZ80ElSjaGE8Ocg8wbPN18tbmsy761zN5SuIl
```

- 成功：`{"code":1,"data":{"id":<fenbiUserId>,"phone":"...",...}}`，下发 cookie：`sess`、`persistent`、`userid`、`sid`、`tourist`。
- 失败：`{"code":11,"msg":"账号或密码错误"}`。
- 风控：可疑请求返回 **HTTP 430** + `{"contextId":"..."}`（阿里云 fpr 滑块）。必须复用 fenbi_fetch.py 那套 UA / Origin / Referer；机房 IP 连打会被拦，**登录要限频（失败后冷却，不自动重试）**。
- 会话寿命：`persistent=true` 的 cookie **8 天后仍有效**（2026-11-21 实测）。

### 2.2 登录（扫码，推荐）

```
GET  https://ke.fenbi.com/qrcode-login/api/gen_code
  -> {"lgtoken":"...","codeContent":"https://www.fenbi.com/depot/fenbi-scan-login/index.html?lgtoken=...&app=web"}

POST https://ke.fenbi.com/qrcode-login/api/query_code_status
  body {"lgtoken":"..."}
  -> 未扫: {"code":1,"msg":"创建新二维码","data":1}
```

（扫码成功后 cookie 落地方式未验证——实现时先落地到「会话 cookie 存库」，并在状态机里留 `confirmed` 分支。）

### 2.3 练习记录列表

```
GET https://tiku.fenbi.com/api/jsjyzhzz/category-exercises
    ?categoryId=-1&cursor=0&count=20&app=web&kav=121&av=121&hav=121
```

```jsonc
{
  "cursor": -1,              // -1 = 没有下一页；否则传回来继续翻
  "datas": [
    { "id": 2173997585, "key": "1_32_20p94gh", "status": 1,
      "createdTime": 1795198538292, "updatedTime": ..., "elapsedTime": 0,
      "sheet": { "id": ..., "type": 3, "name": "...", "paperId": 0,
                 "keypointId": 789122, "questionIds": [16015073, ...],
                 "questionCount": 3 } }
  ]
}
```

- `categoryId=-1` = 全部；传具体知识点 id 可过滤。
- `sheet.type`：`1`=试卷、`3`=知识点练习。
- **限制（已实测）**：`sheet.type=1`（试卷/模考）的记录**不在这个列表里**，它只在 `webapi.fenbi.com`（对该机器一律 401，鉴权未知）。所以 v1 只同步 `type=3` 的知识点练习；UI 必须如实说明，不能假装全同步。

### 2.4 单条记录详情（含作答）

```
GET https://tiku.fenbi.com/api/jsjyzhzz/exercises/{id}
```

```jsonc
{
  "id": 2173997585, "status": 1, "elapsedTime": 0,
  "sheet": { "type": 3, "questionIds": [16015073, 16015182, 16015110], ... },
  "userAnswers": {
    "0": { "questionId": 16015073, "questionIndex": 0,
           "answer": { "choice": "1", "type": 201 }, "time": 9, "flag": 0 }
  }
}
```

- `choice` 是 **0 基索引字符串**（多选 `"0,2"`，判断题 `"0"/"1"`）。
- `time` 单位是**秒**。
- 没有 `isCorrect` 字段，对错要拿 `correctAnswer` 比。

### 2.5 题干与答案

```
GET https://tiku.fenbi.com/api/jsjyzhzz/universal/questions
    ?type=<sheet.type>&questionIds=1,2,3&app=web&kav=121&av=121&hav=121
```

```jsonc
{
  "materials": [...],
  "questions": [
    { "id": 16015073, "type": 1, "content": "<p>...</p>", "difficulty": 5,
      "accessories": [{ "type": 101, "options": ["A项", "B项", "C项", "D项"] }],
      "correctAnswer": { "type": 201, "choice": "1" },
      "materialIndexes": null }
  ]
}
```

## 3. 数据落库

新增两张表（drizzle，SQLite）：

```ts
fenbi_accounts: id, user_id(unique, FK users.id cascade), fenbi_user_id,
  phone, password_enc(nullable), cookie_enc, linked_at,
  last_sync_at, last_sync_result(text/json), status(text: active|expired|revoked)
fenbi_synced_exercises: id, user_id, exercise_id(unique with user_id),
  source_key, session_id(nullable), imported_at, payload_sha256
```

- `password_enc` / `cookie_enc`：**AES-256-GCM**，密钥来自 `FENBI_SECRET`（32 字节 base64）。密钥缺失时**只允许扫码绑定**，禁止存密码。
- 任何日志、错误、埋点里都不得出现手机号后 4 位以外的内容、密码、cookie。

## 4. 去重（三层，必须全做）

1. **会话级**：`source_key = "fenbi:{exercise.key ?? exerciseId}"`（与 `fenbi-parser` / 油猴脚本同口径，历史手工推过的同一套练习会被判成同一条会话）。复用 `importService.importFenbiData` 的 `(user_id, source_key)` 唯一索引——重复同步直接跳过。
2. **题目级**：复用 `fenbi-parser` 的 `externalId`（题目全局 id）。已存在的题不重建、只补作答（这是既有 import 服务的行为，lane 需写测试确认）。
3. **同步级**：`fenbi_synced_exercises` 记录已同步的 `(user_id, exercise_id)`，增量同步先查这张表，命中即跳过，避免每次都把历史重放一遍。

另外：同步**只写 `practice_sessions` 与作答**，不改用户手工建的题（`externalId` 前缀不同自然隔离）；PDF 通道建的题 `jz1680_*` 不会与粉笔 id 撞。

## 5. 对外 API（Web / App 共用）

```
GET    /api/fenbi/status          -> { linked, phoneMasked, fenbiUserId, lastSyncAt, lastResult, syncable:true, unsupported:["paper"] }
POST   /api/fenbi/link            { phone, password } -> { ok } | 4xx { error }
POST   /api/fenbi/qrcode          -> { lgtoken, qrContent }
GET    /api/fenbi/qrcode/status   ?lgtoken= -> { status: pending|scanned|confirmed|expired }
POST   /api/fenbi/sync            { full?: boolean } -> { imported, skipped, newQuestions, failed:[] }
DELETE /api/fenbi/link            -> { ok }   // 解绑并清除密码/cookie
```

- 所有接口走 `authMiddleware`，只操作当前用户的记录。
- `POST /api/fenbi/sync` 加**每分钟一次的限频**（按 user_id），防止误点刷粉笔。

## 6. 定时同步

- 每日 05:20（`src/lib/services/scheduler.ts`，避让 03:00 备份与 04:10 日志清理），调 `syncAllFenbiAccounts()`。
- 只拉上次 `last_sync_at` 之后的记录（按 `createdTime` 过滤，列表本身就是倒序）。
- 失效（401/430）→ 把 `status` 置 `expired`，不自动重试，等用户重新绑定。

## 7. UI

- Web：设置页新增「粉笔同步」卡片——绑定（扫码为主 / 密码为辅）、状态、立即同步、结果摘要、解绑。
- App：`features/fenbi`，同结构；绑定页复用既有表单组件与 `AppErrorView`。
- 必须显示的限制：**「试卷/模考记录暂不支持（接口未开放），只同步知识点练习」**。

## 8. 部署前置（加密密钥）

粉笔密码与会话 cookie 都**加密后**存库（AES-256-GCM）。密钥来源两级：

1. **`FENBI_SECRET`（专用，推荐）**：32 字节 base64（`openssl rand -base64 32`）。
2. **未配时从 `JWT_SECRET` 派生**：HKDF-SHA256，`info = "fenbi-cred-v1"`，输出 32 字节。

这是标准的「密钥分离」做法（RFC 5869）：一个根秘密派生出用途独立的子密钥，
JWT 的 HMAC 使用面不会碰到这把 AES 密钥。

约束与代价：

- 配了 `FENBI_SECRET` 但格式非法 → **fail closed**（拒绝保存凭据），不会悄悄回退到派生。
- 两个都没有（实际不可能，`JWT_SECRET` 是必填）→ 绑定/同步全部 400，提示缺少密钥。
- **换 `JWT_SECRET` 会让所有已绑定账号解不开，必须重新绑定**；轮换前先做迁移
  （解密→用新密钥重加密），当前没有这个脚本。
- 密文带版本前缀 `v1.`，将来换算法可以双读。

## 9. 验收

1. 绑定 → 同步 → `practice_sessions` 出现 `source_key=fenbi:exercise:{id}` 的会话，作答条数与粉笔一致。
2. **再同步一次：imported=0**（三层去重都生效）。
3. 之前手工导入的会话不受影响，总数不重复。
4. 单测覆盖：列表→详情→题目→映射→导入的纯函数链路；去重三层的每条分支。
5. Web 与 App 各跑一次真实绑定（测试账号已有 1 条知识点练习记录：exerciseId `2173997585`，3 题）。
