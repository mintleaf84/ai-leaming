// 笔记标签类型和常量定义
// 注意：这些不能放在 'use server' 文件中

export interface NoteTag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

// 预定义的标签颜色
export const TAG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
];
