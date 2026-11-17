import { Skeleton } from "@/components/ui/skeleton";

/**
 * 「今天」屏 = 取卡这半拍里的骨架态（规格 §4.1：冷启动没有引导页）。
 *
 * 形状与作答屏对齐（一行来源 + 题干 + 输入框），队列/首卡回来时不会整屏跳一下。
 */
export function TodayScreen() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-36 w-full rounded-lg" />
    </div>
  );
}
