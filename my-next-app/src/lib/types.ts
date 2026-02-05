/**
 * @deprecated 请从 '@/types' 导入类型
 * This file is deprecated. Import from '@/types' instead.
 */
export * from '@/types/user';
export * from '@/types/question';
export * from '@/types/practice';

// 保留旧的 Action 类型别名以保持兼容性
export type { PracticeAction as Action } from '@/types/practice';
