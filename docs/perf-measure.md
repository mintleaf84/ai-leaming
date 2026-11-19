# 服务端并发测量（一页）

> 对应 `my-next-app/scripts/measure-concurrency.mjs`。**只测量，不改架构**：
> `src/lib/db/index.ts` 的连接模型与 `better-sqlite3` 同步驱动都不动。

## 1. 为什么需要这个脚本

Next.js 服务端只有一条事件循环，`better-sqlite3` 是**同步**驱动。一个重请求（大查询、
批写、导入）在执行期间会把事件循环占死，同一进程里同时到达的轻请求只能排队 ——
症状是"偶尔某几个接口莫名变慢"，单看某一条接口的 p95 看不出来。

脚本把这件事变成两个数字：轻接口在「无重活」和「重活并行」两种状态下的 p50/p95/p99。

## 2. 怎么跑

```bash
cd my-next-app
# 起一个被测服务（生产构建更接近真实：npm run build && npm run start）
npm run dev

# 方式 A：重活 = 反复打一个需要登录的 HTTP 端点
node scripts/measure-concurrency.mjs \
  --base-url http://localhost:3000 \
  --duration 20 --concurrency 4 \
  --cookie "$BENCH_COOKIE" \
  --heavy-path "/api/v1/questions?limit=100"

# 方式 B：重活 = 对同一个 SQLite 文件批写（不需要登录态）
node scripts/measure-concurrency.mjs \
  --base-url http://localhost:3000 \
  --duration 20 --concurrency 4 \
  --heavy-sql --db-file data/app.db
```

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--base-url` | `http://localhost:3000` | 被测服务地址 |
| `--duration` | `20` | 并行期秒数 |
| `--concurrency` | `1` | **轻请求**并发数（轮询轻接口的 worker 数） |
| `--baseline-seconds` | `3` | 基线期秒数（只有轻请求） |
| `--light-path` | `/api/meta` | 轻接口：无鉴权、无 IO，用来量"纯排队"成本 |
| `--light-interval` | `0` | 轻请求间隔（ms）；0 表示打完立刻打下一个 |
| `--heavy-path` / `--heavy-method` / `--heavy-body` | `GET /api/v1/questions?limit=100` | HTTP 模式的重活 |
| `--heavy-concurrency` | `1` | 重活并发数 |
| `--cookie` | `$BENCH_COOKIE` | 登录态；不传时重活那条腿会全 401 |
| `--heavy-sql` / `--db-file` / `--sql-batch` | 关 / `data/app.db` / `200` | 本地批写模式；会建 `perf_probe` 表并在结束时 DROP |

`--heavy-sql` 的批写跑在**子进程**里：同步驱动如果在测量进程内跑，会把测量器自己的
事件循环也堵住，量出来的 p95 恒等于整个测量时长（踩过）。所以父进程只做 HTTP 采样。

## 3. 看什么

```
轻接口 基线             p50      2.1ms  p95      3.4ms  p99      5.0ms  n=1180
轻接口 重活并行期        p50    210.4ms  p95   1902.7ms  p99   2840.1ms  n=42
重活                   p50    804.8ms  p95    812.7ms  p99    812.7ms  n=25

轻接口 p95 放大：3.4ms → 1902.7ms（×560）
```

- **基线行**：轻接口的固有成本。本机 `dev` 模式下通常 2–20ms；若基线就已经几百毫秒，
  先查服务本身，别急着归因到串行化。
- **并行期行**：同一轻接口在重活压着时的分布。**p50 一起抬起来**才是串行化的特征；
  只有 p99 抬、p50 不动，通常是 GC 或偶发慢查询。
- **重活行**：确认重活真的在跑（`n` 是完成的批次数/请求数，`failed`/`401-403` 单列）。

## 4. 判据

| 现象 | 结论 |
| --- | --- |
| 轻接口 p95 从 ~20ms 跳到**秒级** | 确认重活把轻请求串行化了（事件循环被占死） |
| p95 放大 ≥10× 但仍在百毫秒级 | 有排队，尚未卡死；先看重活是不是可以分片/降频 |
| p95 放大 <2× | 本次重活没有把事件循环占死 |

脚本会按这三档直接打印结论。**不要**把"p95 涨了 20%"当成串行化证据 —— 并发下排队
本身就会抬 p95，判据是量级。

## 5. 配套：索引前后对照（S1 的证据）

同一批查询在**临时库**（按 `drizzle/` 迁移建库，不碰生产库）上的 `EXPLAIN QUERY PLAN`：

| 查询 | 补索引前 | 补索引后（`drizzle/0019_perf_indexes.sql`） |
| --- | --- | --- |
| `session_reviews WHERE session_id=?` | `SCAN session_reviews` | `SEARCH ... USING INDEX idx_session_reviews_session` |
| `textbook_chapters WHERE textbook_id=? ORDER BY order_index,id` | `SCAN` + `USE TEMP B-TREE FOR ORDER BY` | `SEARCH ... USING INDEX idx_textbook_chapters_textbook`（无临时排序） |
| `notes WHERE user_id=? ORDER BY updated_at DESC` | `SCAN` + `USE TEMP B-TREE FOR ORDER BY` | `SEARCH ... USING INDEX idx_notes_user_updated`（无临时排序） |
| `knowledge_cards WHERE user_id=? ORDER BY created_at DESC LIMIT 100` | `SEARCH idx_knowledge_cards_user` + `USE TEMP B-TREE FOR ORDER BY` | `SEARCH ... USING INDEX idx_knowledge_cards_user_created`（无临时排序） |
| `practice_logs WHERE question_id=? AND user_id=? AND is_correct=0` | `SEARCH idx_practice_logs_user_correct` | **不变**（已有复合索引，不需要再加） |

复现：用 `better-sqlite3` 打开一个临时文件库，按 `drizzle/meta/_journal.json` 的
顺序执行 `drizzle/*.sql`，再对上面五条 SQL 跑 `EXPLAIN QUERY PLAN`。

## 6. 已知边界

- 本脚本只测**同进程**内的串行化。多实例部署（各实例独立进程）下，轻请求可以落到
  另一个实例上，症状会小很多；但同一实例内的用户仍会被拖住。
- `dev` 模式带编译开销，绝对值偏高；要对比改动前后请用 `npm run build && npm run start`。
- 不引入 worker_threads、不改连接模型 —— 那是另一件事（见 `docs/performance.md`）。
