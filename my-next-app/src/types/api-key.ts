export type ApiKeyScope = "read" | "write" | "admin";

export interface ApiKeyView {
  id: number;
  key_string: string;
  description: string;
  is_active: number;
  /** 绑定的用户；null 表示全局 key（等价于站长身份） */
  user_id: number | null;
  /** 递进式作用域：admin ⊃ write ⊃ read */
  scopes: ApiKeyScope;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}
