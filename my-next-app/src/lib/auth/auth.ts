import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { User, UserRole } from '@/lib/types';

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'fallback-secret-for-development-only-replace-it-in-production'
);

export const COOKIE_NAME = 'auth_token';

export async function encrypt(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(SECRET);
}

export async function decrypt(input: string): Promise<any> {
    const { payload } = await jwtVerify(input, SECRET, {
        algorithms: ['HS256'],
    });
    return payload;
}

export async function login(user: User) {
    // Create the session
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = await encrypt({ user, expires });

    // Save the session in a cookie
    (await cookies()).set(COOKIE_NAME, session, { expires, httpOnly: true, secure: process.env.NODE_ENV === 'production' });
}

export async function logout() {
    // Destroy the session
    (await cookies()).set(COOKIE_NAME, '', { expires: new Date(0) });
}

export async function getSession() {
    const session = (await cookies()).get(COOKIE_NAME)?.value;
    if (!session) return null;
    try {
        const decrypted = await decrypt(session);
        return decrypted as { user: User; expires: string };
    } catch (e) {
        return null;
    }
}

export async function requireUser(): Promise<User> {
    const session = await getSession();
    if (!session || !session.user) {
        throw new Error('Unauthorized');
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
    const parsed = await decrypt(session);
    parsed.expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
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
