# 粉笔抓取油猴脚本（fenbi-extractor.user.js）

把粉笔 App/网页的练习记录（答题 + 题目解析）推送进本系统，支持**单套一键推送**、**凑齐自动推送**与**历史练习批量导入**。

## 1. 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（或 Violentmonkey）；
2. 打开 `my-next-app/scripts/fenbi-extractor.user.js`，新建脚本并粘贴全部内容；
3. 打开 `https://tiku.fenbi.com` 任意页面，右下角出现「🚀 推流系统」面板即安装成功。

## 2. 配置

| 字段               | 说明                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| 服务器地址         | 本系统地址，如 `https://zhuoyu.887780.xyz`（本地开发填 `http://localhost:3000`） |
| 系统通信凭证       | 系统内「导入页面」获取的 Token，脚本仅存于 Tampermonkey 存储                     |
| 凑齐数据后自动推送 | 勾选后，抓到「答题 + 题目」两份数据 1.5 秒后自动静默推送                         |

## 3. 使用

- **单套推送**：打开某套试卷的【查看解析】页 → 面板第 1、2 项变绿 → 点击「⚡ 一键推送到 ai-leaming」；
- **批量导入**：先在任意试卷的【查看解析】页让面板嗅到接口，再到「练习记录」页展开「已嗅探接口」，点击含 `record/list` 的条目填入，按「▶ 开始批量导入」。脚本按 2.5 s 间隔逐套拉取，保护账号；
- 已推送过的练习会记入本地去重表（最多 2000 条），自动模式静默跳过。

## 4. 服务端契约

`POST {服务器地址}/api/import/fenbi-webhook`，Header `Authorization: Bearer <Token>`：

```jsonc
{
  "exerciseJson": "…", // getSolution 原始响应：{ userAnswers: { <questionGlobalId>: {...} } }
  "solutionsJson": "…", // static/solution 原始响应：{ solutions: [...], materials: [...] }
  "statsJson": "", // 可选，全站正确率统计
}
```

响应（均为 200，除服务端异常）：

```jsonc
{
  "success": true,
  "sessionId": "fenbi_xxx",
  "importedCount": 20, // 本次写入的作答记录数
  "newQuestionsCount": 18, // 新增/更新的题目数
  "skippedQuestionsCount": 2,
  "duplicated": false, // true = 该练习此前已导入，本次未写入任何数据
  "message": "成功导入 20 条作答记录，新增/更新 18 道题目",
}
```

失败时 `success: false`，`message` 带具体原因（脚本弹窗会展示）。

## 5. 失败重试与日志

推送（含批量导入的每一套）失败时会**自动指数退避重试**，最多 3 次。由于服务端按 `sourceKey` 幂等，重试不会产生重复会话或虚高掌握度。

| 结果                                        | 是否重试 | 说明                                         |
| ------------------------------------------- | -------- | -------------------------------------------- |
| 网络错误 / 跨域失败 / 超时（60s）           | ✅       | 退避 1s → 2s（±20% 抖动，上限 8s）           |
| HTTP 408 / 429                              | ✅       | 限流与请求超时                               |
| HTTP 5xx                                    | ✅       | 服务端临时故障                               |
| HTTP 4xx（401/403/404 等）                  | ❌       | Token 错误、地址错误，重试无意义             |
| HTTP 200 且 `success:false`                 | ❌       | 业务失败（如"解析结果为空"），重试也不会变好 |
| HTTP 200 且 `success:true, duplicated:true` | —        | 视为成功，标记为已推送，不再重复推送         |

每次尝试都会输出一条结构化日志，可在浏览器 Console 里按前缀过滤（`[fenbi-import]`）：

```jsonc
{"ts":"2026-11-11T01:02:03.456Z","event":"push-attempt","key":"fenbi:abc123",
 "attempt":1,"maxAttempts":3,"kind":"http","status":503,"elapsedMs":812,"message":"upstream down"}
{"ts":"...","event":"push-retry-scheduled","key":"fenbi:abc123","attempt":1,"retryInMs":1043, ...}
{"ts":"...","event":"push-succeeded","key":"fenbi:abc123","attempt":2,"status":200,"elapsedMs":233}
```

`event` 取值：`push-attempt`（每次请求后）、`push-retry-scheduled`（安排重试）、`push-succeeded`、`push-skipped-duplicate`、`push-failed`（含 `retryable` 字段）。手动模式下失败弹窗会显示 HTTP 状态、已重试次数与服务端 `message`。

## 6. 幂等与去重（重要）

服务端以 `sourceKey` 做幂等：

- 优先取练习自身标识（`key` → `exerciseId` → `id`）；
- 缺失时退化为「练习名 + 题目集合」指纹；
- `practice_sessions` 上有 `(user_id, source_key)` 唯一索引，重复推送直接复用既有会话，**不写日志、不累加掌握度**。

因此：重复推送、超时重试、批量重跑都是安全的；想重新导入同一套练习，需先删除对应会话。

## 7. 已知限制

- 批量导入依赖你在练习记录页嗅到的列表接口 URL，脚本不臆造接口地址；
- `static/solution` 需要 `exerciseId`，脚本优先从 `getSolution` 响应里取，取不到则退回 `key`；
- 脚本只劫持 `*.fenbi.com`（严格 host 校验），不会把其他站点数据推上来；
- 重试期间面板按钮显示 `🔁 重试中 n/3`；批量模式重试会拉长单套耗时，属预期。
