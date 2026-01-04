/**
 * 管理员操作审计类型定义与辅助函数
 * 该文件可被客户端和服务器组件共享
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
    | 'OTHER';

// 目标类型枚举
export type TargetType = 'user' | 'question' | 'ai_config' | 'ai_model_route' | 'prompt' | 'system' | null;

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

/**
 * 格式化操作类型为中文
 */
export function formatActionName(action: AdminAction): string {
    const actionNames: Record<AdminAction, string> = {
        'DELETE_USER': '删除用户',
        'RESET_PASSWORD': '重置密码',
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
        'OTHER': '其他操作',
    };
    return actionNames[action] || action;
}
