import { cookies, headers } from 'next/headers';
import dayjs from 'dayjs';
import { NextRequest, NextResponse } from 'next/server';
import { User, UserRole } from '@/types';
import { getUserById, revokeUserSessions } from './user-service';
import { cache } from 'react';

// 从 Edge 兼容模块重新导出 JWT 相关功能
export { encrypt, decrypt, COOKIE_NAME } from './auth-edge';
import { encrypt, decrypt, COOKIE_NAME } from './auth-edge';

export async function login(user: User) {
    // Create the session
    const expires = dayjs().add(7, 'day').toDate();
    // Include token_version in the session payload
    const session = await encrypt({ user, expires });

    // Save the session in a cookie
    (await cookies()).set(COOKIE_NAME, session, { expires, httpOnly: true, secure: process.env.NODE_ENV === 'production' });

    return session;
}

export async function logout() {
    const session = await getSession();
    if (session?.user?.id) {
        await revokeUserSessions(session.user.id);
    }
    // Destroy the session in cookie
    (await cookies()).set(COOKIE_NAME, '', { expires: new Date(0) });
}

export const getSession = cache(async () => {
    let session = (await cookies()).get(COOKIE_NAME)?.value;

    // Support Bearer Token for Mobile
    if (!session) {
        const authHeader = (await headers()).get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            session = authHeader.split(' ')[1];
        }
    }

    if (!session) return null;
    try {
        const decrypted = await decrypt(session);
        return decrypted as { user: User; expires: string };
    } catch (_e) {
        return null;
    }
});

export async function requireUser(): Promise<User> {
    const session = await getSession();
    if (!session || !session.user) {
        throw new Error('Unauthorized');
    }

    // Strict Mode: Check if token_version matches DB
    // 安全加固：显式将 ID 转为数字，防止 JWT 序列化导致的类型不匹配
    const dbUser = await getUserById(Number(session.user.id));
    if (!dbUser) {
        throw new Error('Unauthorized: User not found');
    }

    // If DB has a version but session doesn't, or they don't match
    if (dbUser.token_version !== (session.user.token_version || 0)) {
        throw new Error('Unauthorized: Session revoked');
    }

    return session.user;
}

export async function requireRole(allowedRoles: UserRole[]): Promise<User> {
    const user = await requireUser();
    if (!allowedRoles.includes(user.role)) {
        throw new Error('Forbidden: Insufficient permissions');
    }
    return user;
}

export async function updateSession(request: NextRequest) {
    const session = request.cookies.get(COOKIE_NAME)?.value;
    if (!session) return;

    // Refresh the session so it doesn't expire
    const parsed = await decrypt(session) as any;
    parsed.expires = dayjs().add(7, 'day').toDate();
    const res = NextResponse.next();
    res.cookies.set({
        name: COOKIE_NAME,
        value: await encrypt(parsed),
        httpOnly: true,
        expires: parsed.expires,
        secure: process.env.NODE_ENV === 'production'
    });
    return res;
}
