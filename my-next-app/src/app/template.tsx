"use client";

import { motion } from "framer-motion";

/**
 * 路由切换转场（docs/mobile-performance.md P0-3）
 *
 * `template.tsx` 每次导航都会重新挂载，所以这里的动画等于"每次点击都跑一遍"。
 * 原实现是 `scale: 0.99 + y: 12` 的 spring（stiffness 260 / damping 28），
 * 收敛需要 400–600ms —— 而 scale 会让整个视口内容重新光栅化，是"点了之后
 * 页面要缓一下才稳"的直接来源。
 *
 * 现在只保留纯 opacity 的短过渡：
 *   * 不碰 transform，避免整页重绘；
 *   * duration 0.15s，人眼仍能感知"页面进来了"，但不占用主线程；
 *   * 位移/缩放交给页面内部的具体组件（弹层、卡片展开），不在路由层做。
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
}
