import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/auth";
import { getTodayQueue } from "@/lib/services/recall";

import RecallSession from "./RecallSession";

export const metadata: Metadata = {
  title: "回忆自测",
};

/**
 * 「今天」页（规格 §4.1：冷启动打开即第一张卡）。
 *
 * 队列的**卡片编号**在这里就已经拿到了（`getTodayQueue()`），一次传给客户端，
 * 首屏因此不用等 action 回来再取第一张卡。`getRecallQueueAction` 现在也会回
 * `ids`，但那是客户端重新拉取时才用的（例如刷新、跨学习日）。
 */
export default async function RecallPage() {
  const user = await requireUser();
  const queue = await getTodayQueue(user.id);

  return (
    <RecallSession
      initialQueue={{
        ids: [...queue.due, ...queue.fresh],
        due: queue.due,
        fresh: queue.fresh,
        total: queue.total,
        estimatedMinutes: queue.estimatedMinutes,
      }}
    />
  );
}
