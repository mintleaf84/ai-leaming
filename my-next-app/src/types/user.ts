/** 用户角色 */
export type UserRole = "admin" | "student" | "teacher";

/** 基础用户接口 */
export interface User {
  id: number;
  username: string;
  role: UserRole;
  token_version: number;
  created_at: string;
}

/** 用户个人资料类型 */
export interface UserProfile {
  id: number;
  username: string;
  role: UserRole;
  created_at: string;
  subscription: {
    plan_name: string;
    plan_id: string;
    status: string;
    expires_at: string | null;
    usage_today: Record<string, number>;
    limits: Record<string, number>;
  } | null;
  stats: {
    total_questions: number;
    correct_count: number;
    accuracy: number;
    practice_days: number;
    total_sessions: number;
    total_tags: number;
    mastered_tags: number;
    total_chats: number;
  };
}

/** 用户设置项 */
export interface UserSettings {
  theme?: "light" | "dark" | "system";
  readingSpeed?: number;
  [key: string]: unknown;
}
