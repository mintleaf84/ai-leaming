import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-background p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Header Skeleton */}
        <div className="flex items-end justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Main Grid: 3 Clean Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <Skeleton className="h-[280px] rounded-3xl" />
          {/* Card 2 */}
          <Skeleton className="h-[280px] rounded-3xl" />
          {/* Card 3 */}
          <Skeleton className="h-[280px] rounded-3xl" />
        </div>

        {/* Lower Section Skeleton */}
        <div className="pt-6">
          <Skeleton className="h-6 w-24 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-[88px] rounded-2xl" />
            <Skeleton className="h-[88px] rounded-2xl" />
            <Skeleton className="h-[88px] rounded-2xl" />
            <Skeleton className="h-[88px] rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
