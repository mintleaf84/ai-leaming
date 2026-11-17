# 性能基线台账

> 用途：`docs/performance.md` 的任务卡都要求「改前/改后数字」，本文件就是那个数字。
> 每次改完性能相关代码，追加一行并在 PR 里贴对比；**不允许覆盖历史行**。
>
> 采集方式：手机真机（生产构建）访问，数据落 `web_vitals` 表；
> 取值脚本见 §3。实验室数字（Lighthouse）不记在这里 —— 与"跟手"正交。

## 1. 采集口径

- 视口：真机（iPhone X 系 375×812 起），不是 DevTools 模拟。
- 指标：INP / LCP / CLS 取 **p75**；样本 ≥ 20 次交互才算一档（低于 20 条标"样本不足"）。
- 路由：至少覆盖 `/dashboard`、`/wrong-book`、`/recall`、`/knowledge`、`/practice`。
- 同时记录 First Load JS（来自 CI 的 `npm run perf:budget` 输出），它是唯一能在本机拿到的数字。

## 2. 台账

| 日期       | 版本                    | INP p75（ms） | LCP p75（ms） | CLS p75 | First Load JS（最大路由）     | 备注                                                   |
| ---------- | ----------------------- | ------------- | ------------- | ------- | ----------------------------- | ------------------------------------------------------ |
| 2026-11-17 | 90def0a（基线，改动前） | 未测          | 未测          | 未测    | 待 CI 首次 `perf:budget` 输出 | 埋点（T-01）刚上线，表内为空；需真机采集 10 分钟后回填 |

**当前为什么是空的**：T-01 只负责"能采到"，采集本身需要真机 + 生产构建。
本机 glibc 2.17 跑不了 Chromium 与 `next build`（见 `docs/engineering.md`），
所以这一行必须由人补，不能由 CI 代劳。

## 3. 取值脚本

库表：`web_vitals(kind, route, name, value, rating, from_route, created_at)`，
`value` 为毫秒（CLS 放大 1000）。`kind` 三类：

| kind | name | 含义 |
| --- | --- | --- |
| `vital` | `INP` / `LCP` / `CLS` / `TTFB` / `FCP` | Core Web Vitals（按页面加载归属首屏路由） |
| `launch` | `launch` | 首屏可交互：`domInteractive - startTime` |
| `nav` | `nav` | 单次交互耗时（按下 → 下一帧）；`from_route` 记是在哪一页点的 |

**首选方式：一条命令出表**

```bash
npm run vitals:report                    # 默认 data/ai-learning.db
npm run vitals:report -- --since 2026-11-17
npm run vitals:report -- --json          # 机器可读
# 容器内：
docker compose exec ai-learning node scripts/vitals-report.mjs
```

输出按 kind 分组、p75 倒序排列，自动标注「样本不足（<20）」和「超阈值」，
末尾还给出可直接粘进 §2 台账的一行。

需要手写 SQL 时：

```bash
# 按路由看 INP 最差的前 10 条原始点
sqlite3 data/ai-learning.db \
  "SELECT route, value, datetime(created_at,'localtime') FROM web_vitals
   WHERE name='INP' ORDER BY value DESC LIMIT 10;"

# 样本量够不够下结论
sqlite3 data/ai-learning.db \
  "SELECT name, route, count(*) FROM web_vitals GROUP BY 1,2 ORDER BY 3 DESC;"
```

程序内等价的 p75 计算见 `src/lib/services/web-vitals.ts` 的 `percentile()`
（升序取第 `ceil(p*n)` 个点；偶数样本取偏低一侧，避免两次统计间跳动 —— 已有单测固定该约定）。

## 4. 事件循环与 API 基线

| 指标                    | 目标         | 采集                                                                      | 首次记录                        |
| ----------------------- | ------------ | ------------------------------------------------------------------------- | ------------------------------- |
| 事件循环延迟 p99        | < 50ms       | 生产日志 `[perf] event loop lag`（`src/instrumentation.ts`，30s 一次）    | 待真机/生产运行后回填           |
| API p95（5 个高频端点） | 环比 +20% 内 | `npm run perf:api -- --base-url <prod> --cookie "$BENCH_COOKIE" --update` | 待首次运行（需要登录态 cookie） |

> `perf:api` 只做环比：绝对值取决于机器，写进台账的是"首次运行记下的那一版"。
> 改索引、改查询后重跑，`.perf-baseline.json` 的 `api` 段会自动与上一次比较。
