/**
 * 管理员操作审计类型定义
 * Admin Audit Type Definitions
 */

// 操作类型枚举
export type AdminAction =
    | 'DELETE_USER'
    | 'RESET_PASSWORD'
    | 'CHANGE_ROLE'
    | 'DELETE_QUESTION'
    | 'UPDATE_QUESTION'
    | 'CREATE_QUESTION'
    | 'UPDATE_AI_CONFIG'
    | 'DELETE_AI_CONFIG'
    | 'UPDATE_AI_ROUTE'
    | 'UPDATE_PROMPT'
    | 'BACKUP_DATABASE'
    | 'RESTORE_DATABASE'
    | 'REVOKE_SESSION'
    | 'BATCH_DELETE_QUESTION'
    | 'CREATE_API_KEY'
    | 'TOGGLE_API_KEY'
    | 'DELETE_API_KEY'
    | 'TEST_AI_CONNECTION'
    | 'OTHER';

// 目标类型枚举
export type TargetType = 'user' | 'question' | 'ai_config' | 'ai_model_route' | 'prompt' | 'system' | 'api_key' | null;

// 审计日志条目
export interface AdminLogEntry {
    id: number;
    user_id: number;
    username: string;
    action: AdminAction;
    target_type: TargetType;
    target_id: string | null;
    details: string | null;
    ip_address: string | null;
    created_at: string;
}

// 操作类型中文映射
export const ADMIN_ACTION_LABELS: Record<AdminAction, string> = {
    'DELETE_USER': '删除用户',
    'RESET_PASSWORD': '重置密码',
    'REVOKE_SESSION': '强制下线',
    'CHANGE_ROLE': '变更角色',
    'DELETE_QUESTION': '删除题目',
    'UPDATE_QUESTION': '更新题目',
    'CREATE_QUESTION': '创建题目',
    'UPDATE_AI_CONFIG': '更新AI配置',
    'DELETE_AI_CONFIG': '删除AI配置',
    'UPDATE_AI_ROUTE': '更新模型路由',
    'UPDATE_PROMPT': '更新提示词',
    'BACKUP_DATABASE': '备份数据库',
    'RESTORE_DATABASE': '恢复数据库',
    'BATCH_DELETE_QUESTION': '批量删除题目',
    'CREATE_API_KEY': '创建API密钥',
    'TOGGLE_API_KEY': '切换API密钥状态',
    'DELETE_API_KEY': '删除API密钥',
    'TEST_AI_CONNECTION': '测试AI连接',
    'OTHER': '其他操作',
};

/**
 * 格式化操作类型为中文
 */
export function formatActionName(action: AdminAction): string {
    return ADMIN_ACTION_LABELS[action] || action;
}
/**
 * 用户管理视图模型
 */
export interface UserAdminView {
    id: number;
    username: string;
    role: string;
    created_at: string;
    token_version: number;
    plan_id?: string;
    plan_name?: string;
    subscription_status?: string;
    expires_at?: string | null;
    is_admin: boolean;
}
