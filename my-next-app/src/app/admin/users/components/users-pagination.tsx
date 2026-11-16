"use client";

import React from "react";
import { Button } from "@/components/ui/button";

interface UsersPaginationProps {
  /** 当前页（1 起） */
  page: number;
  limit: number;
  total: number;
  /** 当前页已渲染的行数：为 0 时文案显示「显示 0 到 0」 */
  shownCount: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * 分页条：条数文案 + 上一页/下一页（翻页由外部回调改页码）
 */
export function UsersPagination({
  page,
  limit,
  total,
  shownCount,
  loading,
  onPrev,
  onNext,
}: UsersPaginationProps) {
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        显示 {shownCount > 0 ? (page - 1) * limit + 1 : 0} 到{" "}
        {Math.min(page * limit, total)} 条，共 {total} 条
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1 sm:h-9 sm:flex-none"
          onClick={onPrev}
          disabled={page === 1 || loading}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1 sm:h-9 sm:flex-none"
          onClick={onNext}
          disabled={page * limit >= total || loading}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
