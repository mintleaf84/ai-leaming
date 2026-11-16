"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 列表加载骨架：lg 起表格形态（5 行），< lg 起卡片形态（3 张）
 */
export function UsersLoadingSkeleton() {
  return (
    <>
      {/* 表格骨架：lg 起 */}
      <div className="hidden space-y-2 lg:block">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={`table-skeleton-${i}`}
            className="h-12 w-full rounded-lg"
          />
        ))}
      </div>
      {/* 列表骨架：< lg */}
      <div className="space-y-2 lg:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={`card-skeleton-${i}`}
            className="h-20 w-full rounded-lg"
          />
        ))}
      </div>
    </>
  );
}
