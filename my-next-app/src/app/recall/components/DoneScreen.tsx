import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * 完成屏：本次队列都已作答。
 *
 * `lastNote` 是最后一张卡的 `nextReviewText`（「下次 11 月 20 日」/「明天只重测这 3 条」），
 * 没拿到时才退回一句默认文案——日期一律由服务端给，UI 不自己算。
 */
export function DoneScreen({ lastNote }: { lastNote: string | null }) {
  return (
    <EmptyState
      icon={<CheckCircle2 className="h-10 w-10" aria-hidden />}
      title="今天的回忆做完了"
      description={lastNote ?? "明天再来，新卡会按节奏出现。"}
      action={
        <Button asChild variant="outline" size="lg">
          <Link href="/recall/decks">管理卡片</Link>
        </Button>
      }
    />
  );
}
