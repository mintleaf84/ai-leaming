# ai-leaming-mcp

把 ai-leaming 的 `/api/external/*` 暴露成 MCP 工具（stdio 传输），供 dsh / 其他 MCP 客户端挂载。

**不改后端、不缓存、不做业务判断**：幂等键、dry-run、限流、作用域全部由服务端负责。

## 用法

```bash
# 1) 在 ai-leaming「设置 → API Key」签发一把 sk_ key（只读用 read，写操作用 write）
# 2) 构建
npm install && npm run build

# 3) 让客户端挂载（以 dsh 为例，配置形态按其文档）
AI_LEAMING_BASE_URL=https://your-host \
AI_LEAMING_API_KEY=sk_xxx \
  node /path/to/mcp-server/dist/index.js
```

环境变量：

| 变量                  | 默认                    | 说明                                             |
| --------------------- | ----------------------- | ------------------------------------------------ |
| `AI_LEAMING_BASE_URL` | `http://localhost:3000` | 服务地址，末尾斜杠会被去掉                       |
| `AI_LEAMING_API_KEY`  | 无（必填）              | `sk_` 开头的 API Key；缺了直接退出，不降级成匿名 |

## 工具

工具清单的唯一事实源是 [`tools.json`](./tools.json) —— server 直接读它注册工具，
`npm run mcp:check`（仓库根目录）会拿它对照 `docs/openapi.json`，路径/方法/参数任一处漂移就红。

11 个工具分四组：题库（`list_questions` / `get_question`）、练习（`list_practice_sessions` /
`get_practice_session` / `import_answers`）、学情（`get_wrong_book` / `get_mastery` / `get_overview`）、
复习（`get_recall_queue` / `submit_review` / `delete_recall_card`）。

写工具都支持 `dryRun`，`delete_recall_card` 的描述里明确要求"先预演、报数字、再确认"。

## 为什么不做成托管 HTTP MCP

dsh 跑在本机，stdio 代理就够了：零公网攻击面、零部署、key 仍由后端签发与撤销。
将来要托管版，把 `buildRequest` 换成 HTTP transport 即可，工具表原样复用。
