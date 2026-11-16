"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 列表加载骨架：与拆分前一致，固定 6 条等高占位（表格与卡片共用同一形态）
 */
export function ApiKeysLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={`api-key-skeleton-${i}`} className="h-20 rounded-lg" />
      ))}
    </div>
  );
}
