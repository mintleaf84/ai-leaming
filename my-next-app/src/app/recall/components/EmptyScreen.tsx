import Link from "next/link";
import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * 空队列屏：今天确实没有到期卡 / 新卡。
 *
 * 与错误态严格区分：只有队列拿到编号且计数为 0 才走到这里（「有卡却拿不到编号」
 * 必须是错误态，否则用户会以为做完了一天）。两个出口一个指向导入、一个指向管理。
 */
export function EmptyScreen() {
  return (
    <EmptyState
      icon={<Layers className="h-10 w-10" aria-hidden />}
      title="今天没有要回忆的卡"
      description="到期的卡和新卡会在早上重新排一次。"
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline" size="lg">
            <Link href="/recall/decks#import">导入卡组</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/recall/decks">管理卡片</Link>
          </Button>
        </div>
      }
    />
  );
}
