/**
 * 用户相关类型定义
 * User Related Type Definitions
 */

// 用户角色
export type UserRole = 'admin' | 'student' | 'teacher';

// 用户实体
export interface User {
    id: number;
    username: string;
    role: UserRole;
    token_version?: number;
}

// 用户会话信息
export interface UserSession {
    user: User;
    exp?: number;
}
