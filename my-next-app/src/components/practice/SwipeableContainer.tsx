"use client";

import { useSwipeable } from "react-swipeable";

interface SwipeableContainerProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  children: React.ReactNode;
  className?: string;
  /** 触发滑动的最小距离（像素） */
  threshold?: number;
}

/**
 * 支持左右滑动手势的容器组件
 * 用于移动端滑动切换题目
 */
export function SwipeableContainer({
  onSwipeLeft,
  onSwipeRight,
  children,
  className = "",
  threshold = 50,
}: SwipeableContainerProps) {
  const handlers = useSwipeable({
    onSwipedLeft: () => onSwipeLeft?.(),
    onSwipedRight: () => onSwipeRight?.(),
    trackMouse: false, // 仅响应触摸
    delta: threshold,
    preventScrollOnSwipe: false, // 允许垂直滚动
  });

  return (
    <div {...handlers} className={className}>
      {children}
    </div>
  );
}
