import { NextRequest, NextResponse } from 'next/server';
import { getUserByUsername } from '@/lib/auth/user-service';
import { comparePassword } from '@/lib/auth/password';
import { login } from '@/lib/auth/auth';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
    // Rate Limiting 检查
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(clientIP, '/api/auth/login');

    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: '请求过于频繁，请稍后再试' },
            {
                status: 429,
                headers: {
                    'X-RateLimit-Limit': String(rateLimitResult.limit),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.resetTime / 1000)),
                    'Retry-After': String(Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)),
                }
            }
        );
    }

    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
        }

        const user = getUserByUsername(username);
        if (!user) {
            return NextResponse.json({ error: '用户名或密码不正确' }, { status: 401 });
        }

        const isPasswordCorrect = await comparePassword(password, user.password_hash);
        if (!isPasswordCorrect) {
            return NextResponse.json({ error: '用户名或密码不正确' }, { status: 401 });
        }

        await login({ id: user.id, username: user.username, role: user.role });

        return NextResponse.json({
            message: '登录成功',
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
    }
}
