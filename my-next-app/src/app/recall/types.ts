/**
 * 回忆自测页（客户端）的共享类型。
 *
 * `RecallPhase` 是作答流的状态机状态（`loading → today → question ⇄ judge →
 * (下一张 | done)`），`RecallInitialQueue` 是服务端 `getTodayQueue()` 交给客户端
 * 首屏的队列快照（见 `../page.tsx`）。抽到这里是为了让 `hooks/` 与 `components/`
 * 共享同一份定义，而不是互相从组件文件里 import 类型。
 */

import type { RecallCardId } from "./lib/actions";

export type RecallPhase =
  "loading" | "today" | "question" | "judge" | "done" | "empty" | "error";

/** 服务端快照：队列顺序由 `/recall/page.tsx` 提供（action 也回 `ids`，优先用 action 的） */
export interface RecallInitialQueue {
  /** 服务端渲染时算好的卡片编号（顺序 = 到期优先，再新卡） */
  ids: RecallCardId[];
  due: RecallCardId[];
  fresh: RecallCardId[];
  total: number;
  estimatedMinutes: number;
}
