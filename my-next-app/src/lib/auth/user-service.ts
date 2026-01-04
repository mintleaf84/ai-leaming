import db from '@/lib/db';
import { hashPassword } from './password';
import { UserRole } from '@/lib/types';

// 数据库中的完整用户记录
export interface UserRecord {
    id: number;
    username: string;
    password_hash: string;
    role: UserRole;
    created_at: string;
}

// 简化的用户类型（不含密码）
export interface User {
    id: number;
    username: string;
    role: UserRole;
}

/**
 * 创建新用户
 */
export async function createUser(username: string, passwordPlain: string, role: UserRole = 'student'): Promise<User> {
    const passwordHash = await hashPassword(passwordPlain);
    const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);

    return {
        id: result.lastInsertRowid as number,
        username,
        role
    };
}

/**
 * 通过用户名获取用户（包含密码 hash，仅用于内部验证）
 */
export function getUserByUsername(username: string): UserRecord | null {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRecord | null;
}

/**
 * 通过 ID 获取用户
 */
export function getUserById(id: number): User | null {
    const record = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id) as User | null;
    return record;
}
