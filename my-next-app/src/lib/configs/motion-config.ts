/**
 * 苹果风格 Spring 参数配置
 * 提供物理仿真感，而非固定时长
 */
export const APPLE_SPRING = {
  // 慢速入场 (用于全屏展开)
  soft: {
    type: "spring" as const,
    stiffness: 100,
    damping: 18,
    mass: 1,
  },
  // 标准交互 (用于按钮触压)
  default: {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 1,
  },
  // 极速反馈 (用于极短的反馈)
  snappy: {
    type: "spring" as const,
    stiffness: 500,
    damping: 25,
    mass: 1,
  },
};
