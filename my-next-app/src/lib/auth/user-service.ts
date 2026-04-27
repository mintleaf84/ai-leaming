import { drizzleDb, drizzleSchema } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from './password';
import { UserRole } from '@/types';
import { cache } from 'react';

// 数据库中的完整用户记录
export interface UserRecord {
    id: number;
    username: string;
    password_hash: string;
    role: UserRole;
    created_at: string;
    token_version: number;
}

// 简化的用户类型（不含密码）
export interface User {
    id: number;
    username: string;
    role: UserRole;
    token_version?: number;
}

/**
 * 创建新用户 (LibSQL 异步版)
 */
export async function createUser(username: string, passwordPlain: string, role: UserRole = 'student'): Promise<User> {
    const passwordHash = await hashPassword(passwordPlain);
    
    const result = await drizzleDb.insert(drizzleSchema.users).values({
        username,
        password_hash: passwordHash,
        role,
        token_version: 0
    });

    // 处理 LibSQL 的 lastInsertRowid (兼容性处理)
    const lastId = (result as any).lastInsertRowid || (result as any).rowsAffected;

    return {
        id: Number(lastId),
        username,
        role,
        token_version: 0
    };
}

/**
 * 通过用户名获取用户（包含密码 hash，仅用于内部验证）(Cached per request, Async)
 */
export const getUserByUsername = cache(async (username: string): Promise<UserRecord | null> => {
    const [user] = await drizzleDb.select()
        .from(drizzleSchema.users)
        .where(eq(drizzleSchema.users.username, username))
        .limit(1);
    
    return (user as UserRecord) || null;
});

/**
 * 通过 ID 获取用户 (Cached per request, Async)
 */
export const getUserById = cache(async (id: number): Promise<User | null> => {
    const [user] = await drizzleDb.select({
            id: drizzleSchema.users.id,
            username: drizzleSchema.users.username,
            role: drizzleSchema.users.role,
            token_version: drizzleSchema.users.token_version
        })
        .from(drizzleSchema.users)
        .where(eq(drizzleSchema.users.id, id))
        .limit(1);
    
    return (user as User) || null;
});

/**
 * 撤销用户的所有会话 (通过增加版本号)
 */
export async function revokeUserSessions(userId: number): Promise<void> {
    await drizzleDb.update(drizzleSchema.users)
        .set({ 
            token_version: sql`${drizzleSchema.users.token_version} + 1` 
        })
        .where(eq(drizzleSchema.users.id, userId));
}
