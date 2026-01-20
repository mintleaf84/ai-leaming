import { NextRequest, NextResponse } from 'next/server';
import { createUser, getUserByUsername } from '@/lib/auth/user-service';
import { login } from '@/lib/auth/auth';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
    // Rate Limiting 检查
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(clientIP, '/api/auth/register');

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

        if (username.length < 3) {
            return NextResponse.json({ error: '用户名至少需要3个字符' }, { status: 400 });
        }

        if (password.length < 6) {
            return NextResponse.json({ error: '密码至少需要6个字符' }, { status: 400 });
        }

        const existingUser = getUserByUsername(username);
        if (existingUser) {
            return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
        }

        const user = await createUser(username, password);

        // Auto login after registration
        const token = await login({ id: user.id, username: user.username, role: user.role });

        return NextResponse.json({
            message: '注册成功',
            user: { id: user.id, username: user.username, role: user.role },
            token
        });
    } catch (error: any) {
        console.error('Registration error detailed:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        return NextResponse.json({ error: `服务器内部错误: ${error.message}` }, { status: 500 });
    }
}
