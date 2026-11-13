import {
  fsrs,
  generatorParameters,
  type FSRS,
  type FSRSParameters,
} from "ts-fsrs";

/**
 * FSRS 调度参数的**唯一事实来源**。
 *
 * 规格（docs/ai-learning-recall-spec.md §1.3）把目标保留率写死 0.9 且不提供任何
 * 用户可调项；刷题 SRS 与回忆自测必须用同一份参数，否则「同一道题在两条链路上
 * 的间隔」会不一致。参数只在这里定义一次，两个模块各取一个实例。
 */
export const FSRS_REQUEST_RETENTION = 0.9;

/**
 * 创建调度器实例。
 *
 * 注意：`fsrs()` 返回的对象带内部可变状态（seed、上次参数校验结果），
 * 因此**不要**跨模块共享同一个实例，各自调用本函数构造即可。
 */
export function createFsrsScheduler(
  overrides: Partial<FSRSParameters> = {},
): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: FSRS_REQUEST_RETENTION,
      ...overrides,
    }),
  );
}

/** 刷题 SRS（question_srs）用：保持既有行为，与历史默认参数等价。 */
export function createQuestionScheduler(): FSRS {
  return createFsrsScheduler();
}

/**
 * 回忆自测（recall_card_states）用：关闭 learning steps。
 *
 * 队列是「每日」粒度的（规格 §3：到期卡 + 每日新卡上限），而 ts-fsrs 的
 * 1m/10m 学习步是**当天**消费的——在本产品里当天永远不会再进队列，学习步只会
 * 把卡反复拉回到当天而不产生任何用户可见的复习，所以直接关掉，让 New 卡
 * 首次评分后立即进入天级间隔。
 */
export function createRecallScheduler(): FSRS {
  return createFsrsScheduler({ enable_short_term: false });
}
