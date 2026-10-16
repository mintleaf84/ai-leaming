/**
 * 订阅系统类型定义
 * Subscription System Type Definitions
 */

// 套餐等级
export type PlanTier = "free" | "basic" | "pro" | "custom";

// 用量类型
export type UsageType =
  "ai_chat" | "practice" | "review" | "rag" | "mnemonic" | "first_principles";

// 用量类型中文映射
export const USAGE_TYPE_LABELS: Record<UsageType, string> = {
  ai_chat: "AI 对话",
  practice: "练习题目",
  review: "AI 复盘",
  rag: "RAG 检索",
  mnemonic: "AI 记忆大师",
  first_principles: "第一性原理",
};

// 套餐等级中文映射
export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  free: "免费版",
  basic: "基础版",
  pro: "专业版",
  custom: "自定义",
};

// 套餐定义 (数据库结构)
export interface SubscriptionPlan {
  id: string; // 唯一标识: 'free', 'basic', 'pro'
  name: string; // 显示名称: '免费版'
  tier: PlanTier; // 套餐等级
  price_monthly: number; // 月价格 (单位: 分)
  limits: Record<UsageType, number>; // 用量限制, -1 表示无限
  features: string[]; // 特性列表 (用于展示)
  is_active: boolean; // 是否启用
  sort_order?: number; // 排序顺序
  created_at?: string;
}

// 用户订阅状态 (数据库结构)
export interface UserSubscription {
  id: number;
  user_id: number;
  plan_id: string;
  status: "active" | "expired" | "cancelled";
  started_at: string;
  expires_at: string | null; // null 表示永不过期
  created_at: string;
}

// 每日用量记录 (数据库结构)
export interface DailyUsage {
  id: number;
  user_id: number;
  usage_date: string; // 'YYYY-MM-DD'
  usage_type: UsageType;
  count: number;
}

// 支付记录 (数据库结构)
export interface PaymentRecord {
  id: number;
  user_id: number;
  order_no: string; // 系统订单号
  payment_no: string | null; // 第三方支付流水号
  plan_id: string;
  amount: number; // 金额 (单位: 分)
  payment_method: "wechat" | "alipay" | "manual" | null;
  status: "pending" | "paid" | "failed" | "refunded";
  created_at: string;
  paid_at: string | null;
}

// --- API 接口类型 ---

// 用量检查结果
export interface UsageCheckResult {
  allowed: boolean;
  current: number; // 当前用量
  limit: number; // 限额 (-1 表示无限)
  remaining: number; // 剩余次数 (-1 表示无限)
  message?: string; // 不允许时的提示信息
}

// 用户订阅详情 (包含套餐信息)
export interface UserSubscriptionDetail extends UserSubscription {
  plan: SubscriptionPlan;
  usage_today: Record<UsageType, number>;
}

// 默认套餐配置 (初始化用)
export const DEFAULT_PLANS: Omit<SubscriptionPlan, "created_at">[] = [
  {
    id: "free",
    name: "免费版",
    tier: "free",
    price_monthly: 0,
    limits: {
      ai_chat: 10,
      practice: 30,
      review: 5,
      rag: 20,
      mnemonic: 5,
      first_principles: 3,
    },
    features: [
      "每日 10 次 AI 对话",
      "每日 30 道练习题",
      "每日 5 次 AI 助记",
      "每日 3 次 第一性原理",
      "基础知识库访问",
    ],
    is_active: true,
    sort_order: 1,
  },
  {
    id: "basic",
    name: "基础版",
    tier: "basic",
    price_monthly: 2900, // ¥29
    limits: {
      ai_chat: 100,
      practice: -1,
      review: 50,
      rag: 100,
      mnemonic: 50,
      first_principles: 30,
    },
    features: [
      "每日 100 次 AI 对话",
      "无限练习题目",
      "每日 50 次 AI 助记",
      "每日 30 次 第一性原理",
      "每日 50 次 AI 复盘",
      "优先客服支持",
    ],
    is_active: true,
    sort_order: 2,
  },
  {
    id: "pro",
    name: "专业版",
    tier: "pro",
    price_monthly: 9900, // ¥99
    limits: {
      ai_chat: -1,
      practice: -1,
      review: -1,
      rag: -1,
      mnemonic: -1,
      first_principles: -1,
    },
    features: [
      "无限 AI 对话",
      "无限练习题目",
      "无限 AI 助记 & 第一性原理",
      "无限 AI 复盘",
      "全部高级功能",
      "专属客服",
    ],
    is_active: true,
    sort_order: 3,
  },
];
