"use client";

import React, { useState } from "react";
import { Play } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface QuestionCountPickerProps {
  /** 可选题目总数 */
  totalCount: number;
  /** 确认后回调，参数为选择的题量 */
  onConfirm: (count: number) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 触发按钮的内容 */
  children: React.ReactNode;
}

/** 预设的快捷题量选项 */
const PRESET_COUNTS = [5, 10, 15, 20, 30];

/**
 * 题量选择器
 * 以 Popover 形式展示，提供预设选项 + 全部，点击即开始
 */
export function QuestionCountPicker({
  totalCount,
  onConfirm,
  disabled = false,
  children,
}: QuestionCountPickerProps) {
  const [open, setOpen] = useState(false);

  // 过滤掉超过总数的预设选项，允许选择等于 totalCount 的值
  const availablePresets = PRESET_COUNTS.filter((c) => c <= totalCount);

  const handleSelect = (count: number) => {
    setOpen(false);
    onConfirm(count);
  };

  // 题目数 <= 5 时直接开始全部，无需选择
  if (totalCount <= 5) {
    // 点击必须落在**调用方传来的那个按钮**上。原来这里套了一层
    // `<span onClick>`：既过不了 jsx-a11y（非交互元素挂交互），又把触发器包成了
    // 伪热区；改成给 span 补 role+tabIndex 更糟 —— 按钮里套按钮，读屏器会念两个控件。
    // 所以把 handler 合并进子元素的 onClick（先跑子元素自己的，再开始练习）。
    if (React.isValidElement<{ onClick?: React.MouseEventHandler }>(children)) {
      const childOnClick = children.props.onClick;
      return React.cloneElement(children, {
        onClick: (e: React.MouseEvent) => {
          childOnClick?.(e);
          if (!disabled) onConfirm(totalCount);
        },
      });
    }
    return <>{children}</>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="w-48 p-2"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
          选择练习题量（共 {totalCount} 题）
        </div>
        <div className="space-y-0.5">
          {availablePresets.map((count) => (
            <button
              key={count}
              className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors flex items-center justify-between"
              onClick={() => handleSelect(count)}
            >
              <span>{count} 题</span>
              <Play className="w-3 h-3 text-muted-foreground" />
            </button>
          ))}
          {/* 全部选项 */}
          <div className="border-t my-1" />
          <button
            className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors flex items-center justify-between font-medium"
            onClick={() => handleSelect(totalCount)}
          >
            <span>全部 {totalCount} 题</span>
            <Play className="w-3 h-3 text-muted-foreground fill-current" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
