import type { UserAdminView } from "@/types/admin";

// 扩展用户类型，包含订阅信息
export interface UserWithSubscription extends UserAdminView {
  plan_id?: string;
  plan_name?: string;
  subscription_status?: string;
  expires_at?: string | null;
}
