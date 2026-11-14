# 回忆自测：验收对照（v1）

> 规格：`fj-teacher-exam-physics/docs/ai-learning-recall-spec.md` §6。
> 落地：`52d23f2`（P1 数据）/ `5e5a7ba`（P2 判分调度）/ `6a73bd1`（P3 页面）。

## 逐条对照

| #   | 规格要求                                                                  | 证据                                                                                                                                                                    | 状态                                                                 |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | 新用户从安装到完成第一张卡 ≤60 秒（用示例卡组）                           | `tests/e2e/recall-deck-import.spec.ts` A：**导入真实卡组文件（104 卡）**→ `/recall` 零点击即进作答屏，CI 实测 ≤120s；「打开即在作答屏」另由 `recall.spec.ts` 覆盖       | **部分**：导入→首卡这一段已有 CI 证据；「安装」与 60s 目标需真机计时 |
| 2   | 列举卡流程 ≤90 秒；填空卡 ≤40 秒                                          | `tests/e2e/recall.spec.ts` A：作答 → 看答案 → 确认结果，`Date.now()` 前后夹算并断言 ≤90s                                                                                | ✅ 列举卡（PR #157 的 CI E2E job 实跑通过）；填空卡 40s 未单独计时   |
| 3   | 判分基准集 20 样本一致率 ≥90%，不一致可一次点击纠正                       | 20 样本 / 74 条人工标注（先标后跑）：`grading-benchmark.test.ts` 实测 **69/74 = 93.24%**（误杀 4 / 假阳 1，均登记在 `KNOWN_GAPS` 棘轮里）；改判入口列举卡与填空卡都覆盖 | ✅ 达标（误差余量 3 条，剩 5 条为「任一命中」规则固有代价）          |
| 4   | 评分与间隔严格等于 ts-fsrs 默认参数（retention 0.9）参考输出（10 步对拍） | `scheduler.test.ts` → 「10 步固定序列：due/stability/difficulty/state/reps/lapses 全部相等」                                                                            | ✅ 自动                                                              |
| 5   | 重复导入同一卡组：卡片数与全部 CardState 不变                             | `recall-import.test.ts` → 「重复导入同一文件」逐列比对；另在 P1 评审后补「卡组行零写入」                                                                                | ✅ 自动                                                              |
| 6   | 单日队列 = due + ≤6 新卡，任何路径不能突破；补做 ≤15                      | `queue.test.ts`(12) → 额度 6/0/99、到期优先、今日已复习消耗额度、跨学习日、按用户隔离                                                                                   | ✅ 自动                                                              |
| 7   | 重测卡仅呈现 `pendingItems` 条目（UI 与日志 `mode:"retest"` 一致）        | `recall.test.ts` → 重测只判 pendingItems、交集更新；`recall.spec.ts` C 断言「明天只重测这 1 条」（CI 实跑通过）                                                         | ✅ 自动（UI 侧为文案级）                                             |
| 8   | 导出文件不含 ReviewLog / typedAnswer / 任何作答数据                       | `recall-import.test.ts` → export round-trip 且字段白名单                                                                                                                | ✅ 自动                                                              |

## 规格未定点：实际采用的裁决

| 项               | 裁决                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| 多用户           | `card_states` / `review_logs` 带 `user_id`；卡组与卡片内容全局共享（`owner_user_id` 为空 = 公共） |
| Learning steps   | 关闭（`enable_short_term: false`）—— 队列按日，1m/10m 学习步当天消费不到                          |
| 重测评分         | pendingItems 全对 → `Good`；仍错 → `Hard`；"全没想起" → `Again`；首发同一套                       |
| 匹配规则         | 保持"任一关键词命中"，但日志记 `keyword_hits` / `keyword_total` 供后续调参                        |
| 拼音/繁简        | 未引入依赖；归一化只做空白/标点/全半角。`verbatim` 默认关闭                                       |
| 切日             | `Asia/Shanghai` 04:00（`src/lib/recall/study-day.ts`）                                            |
| 未知 schema 版本 | 直接拒绝导入，不做兼容猜测                                                                        |

## 已知缺口（不是"忘了"，是明确未做）

1. **#1 的真机计时（唯一待办）**：卡组文件已交付（`fj-teacher-exam-physics/docs/recall/fj-jiaozong-2027.deck.json`，
   104 卡 / 30 组），导入这条腿已由 CI E2E 实跑（≤120s）；但"**安装** → 导入 → 完成第一张卡 ≤60 秒"
   里的「安装」与 60 秒目标必须在真实部署上手工跑一次，CI 的 120s 是慢机器上的上限判据，不是产品目标。
2. **填空卡 40 秒上限**：未单独计时（同一套页面，交互步数更少）。
3. **拼音/形近容错**：按裁决延后（基准集里 1 条错别字误杀即此项代价），等真实错别字反馈。
4. **判分规则固有误杀**：`KNOWN_GAPS` 里剩 5 条（4 误杀 / 1 假阳），是「关键词=条目子串 + 任一命中」
   的代价；改规则会同时推高假阳且需重跑整套基准，故留到 v2。

## 怎么自己验一遍

```bash
cd my-next-app
export PATH=/public/home/cjb/micromamba/envs/node20/bin:$PATH
export LD_PRELOAD=/public/home/cjb/local/lib/libcxa218.so
export NODE_OPTIONS=--experimental-require-module
export JWT_SECRET=x AI_API_KEY=x BACKUP_ENCRYPTION_KEY=x

# 判分 / 调度 / 队列 / 导入（纯单元 + 真实 SQLite）
npx vitest run src/lib/recall src/lib/services/__tests__/recall*.test.ts \
  src/server/actions/__tests__/recall-actions.test.ts

# 端到端（需能跑 next build 的环境；CI 的 e2e job 已包含它）
npx playwright test tests/e2e/recall.spec.ts
```
