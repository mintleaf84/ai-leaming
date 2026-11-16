import type { ApiKeyScope } from "@/types/api-key";

/**
 * 三档作用域的唯一描述来源：对话框里的选项、列表里的徽标都读这里，
 * 避免「说明文案」和「徽标」各写一份后漂移。
 */
export const SCOPE_META: Record<
  ApiKeyScope,
  {
    /** 中文档位名 */
    label: string;
    /** 这一档多了什么权限（对话框里的一行说明） */
    summary: string;
    /** 风险提示（徽标上的极短标签） */
    risk: string;
  }
> = {
  read: {
    label: "只读",
    summary: "查看练习记录、错题、掌握度、知识卡片",
    risk: "低风险",
  },
  write: {
    label: "读写",
    summary: "额外可导入答题记录、增删改题目与卡片",
    risk: "中风险",
  },
  admin: {
    label: "全权",
    summary: "含管理端能力，仅限站长自用",
    risk: "高风险",
  },
};

export const SCOPE_ORDER: ApiKeyScope[] = ["read", "write", "admin"];
