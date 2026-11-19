"use client";

import React from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

interface SessionSummaryProps {
  createdAt: string;
  totalQuestions: number;
  accuracy: number;
  reviewCount: number;
  /**
   * 标题层级：详情页（/history/[id]）用它当页面唯一标题 → "h1"；
   * 列表页展开卡片里它是区块标题 → "h2"（默认）。一屏只能有一个 h1。
   */
  headingLevel?: "h1" | "h2";
}

/**
 * 练习总结卡片组件
 * 显示练习日期、总题数、正确率、复盘数
 */
export function SessionSummary({
  createdAt,
  totalQuestions,
  accuracy,
  reviewCount,
  headingLevel = "h2",
}: SessionSummaryProps) {
  const Heading = headingLevel;
  // 根据正确率显示不同的鼓励语
  const getMessage = () => {
    if (accuracy >= 80) return "🎉 卓越的表现！";
    if (accuracy >= 60) return "💪 继续加油！";
    return "📚 需要重点攻克";
  };

  return (
    <div className="bg-card rounded-3xl p-6 md:p-8 shadow-sm border border-border mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="text-sm text-muted-foreground mb-1">
            练习总结 · {dayjs.utc(createdAt).local().format("YYYY/M/D")}
          </div>
          <Heading className="text-2xl font-semibold text-foreground md:text-3xl">
            {getMessage()}
          </Heading>
        </div>
        <div className="flex gap-4 md:gap-8">
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-foreground">
              {totalQuestions}
            </div>
            <div className="text-xs text-muted-foreground">总题数</div>
          </div>
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-green-600 dark:text-green-400">
              {accuracy}%
            </div>
            <div className="text-xs text-muted-foreground">正确率</div>
          </div>
          <div className="text-center">
            <div className="text-2xl md:text-3xl font-bold text-amber-600 dark:text-amber-400">
              {reviewCount}
            </div>
            <div className="text-xs text-muted-foreground">复盘数</div>
          </div>
        </div>
      </div>
    </div>
  );
}
