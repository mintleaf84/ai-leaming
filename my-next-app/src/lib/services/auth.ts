import { getUserByUsername, createUser as createDbUser, User } from '@/lib/auth/user-service';
import { comparePassword } from '@/lib/auth/password';
import { UserRole } from '@/types';

export class AuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthError';
    }
}

export const authService = {
    /**
     * 验证用户名和密码
     * @returns 用户对象或 null (验证失败)
     */
    async validateCredentials(username: string, passwordPlain: string): Promise<User | null> {
        const userRecord = await getUserByUsername(username);
        if (!userRecord) {
            return null;
        }

        const isValid = await comparePassword(passwordPlain, userRecord.password_hash);
        if (!isValid) {
            return null;
        }

        // 返回不包含密码的 clean user 对象
        return {
            id: userRecord.id,
            username: userRecord.username,
            role: userRecord.role,
            token_version: userRecord.token_version
        };
    },

    /**
     * 注册新用户
     */
    async register(username: string, passwordPlain: string, role: UserRole = 'student'): Promise<User> {
        const existing = await getUserByUsername(username);
        if (existing) {
            throw new AuthError('Username already exists');
        }

        // user-service.createUser 内部已经处理了 hash
        return await createDbUser(username, passwordPlain, role);
    }
};
