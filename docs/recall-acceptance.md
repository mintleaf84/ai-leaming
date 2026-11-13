# 回忆自测：验收对照（v1）

> 规格：`fj-teacher-exam-physics/docs/ai-learning-recall-spec.md` §6。
> 落地：`52d23f2`（P1 数据）/ `5e5a7ba`（P2 判分调度）/ `6a73bd1`（P3 页面）。

## 逐条对照

| #   | 规格要求                                                                  | 证据                                                                                                                             | 状态                                                                              |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | 新用户从安装到完成第一张卡 ≤60 秒（用示例卡组）                           | `tests/e2e/recall.spec.ts` 的首屏用例（打开 `/recall` 即进入作答屏，0 击）                                                       | **部分**：卡组由 e2e 夹具播种，不是真实"安装 → 导入示例卡组"路径；端到端计时见 #2 |
| 2   | 列举卡流程 ≤90 秒；填空卡 ≤40 秒                                          | `tests/e2e/recall.spec.ts` A：作答 → 看答案 → 确认结果，`Date.now()` 前后夹算并断言 ≤90s                                         | **需确认**：CI 机器慢，断言取 90s 上限；填空卡 ≤40s 尚未单独计时                  |
| 3   | 判分基准集 20 样本一致率 ≥90%，不一致可一次点击纠正                       | 单元层：`matcher.test.ts`(19)、`normalize.test.ts`(11) 覆盖规则边界；产品层：判分屏黄条可点改判（`recall.test.ts` 的"改判"用例） | **阻塞**：20 份人工样本属内容侧交付（规格 §7），尚未提供                          |
| 4   | 评分与间隔严格等于 ts-fsrs 默认参数（retention 0.9）参考输出（10 步对拍） | `scheduler.test.ts` → 「10 步固定序列：due/stability/difficulty/state/reps/lapses 全部相等」                                     | ✅ 自动                                                                           |
| 5   | 重复导入同一卡组：卡片数与全部 CardState 不变                             | `recall-import.test.ts` → 「重复导入同一文件」逐列比对；另在 P1 评审后补「卡组行零写入」                                         | ✅ 自动                                                                           |
| 6   | 单日队列 = due + ≤6 新卡，任何路径不能突破；补做 ≤15                      | `queue.test.ts`(12) → 额度 6/0/99、到期优先、今日已复习消耗额度、跨学习日、按用户隔离                                            | ✅ 自动                                                                           |
| 7   | 重测卡仅呈现 `pendingItems` 条目（UI 与日志 `mode:"retest"` 一致）        | `recall.test.ts` → 重测只判 pendingItems、交集更新；`recall.spec.ts` C 断言「明天只重测 N 条」文案                               | ✅ 自动（UI 侧为文案级）                                                          |
| 8   | 导出文件不含 ReviewLog / typedAnswer / 任何作答数据                       | `recall-import.test.ts` → export round-trip 且字段白名单                                                                         | ✅ 自动                                                                           |

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

1. **#3 的 20 份基准样本**：需要内容侧按规格 §7 产出，产品侧已备好"改判日志"用于回算误杀率。
2. **#1 的真实安装路径计时**：当前 e2e 用夹具播种卡组；真实路径要等 `fj-jiaozong-2027.deck.json` 交付后手工跑一次。
3. **填空卡 40 秒上限**：未单独计时（同一套页面，交互步数更少）。
4. **拼音容错**：按裁决延后，等真实错别字反馈。

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

# 端到端（需能跑 next build 的环境）
npx playwright test tests/e2e/recall.spec.ts
```
