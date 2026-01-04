import { NextRequest, NextResponse } from 'next/server';
import { createUser, getUserByUsername } from '@/lib/auth/user-service';
import { login } from '@/lib/auth/auth';

export async function POST(request: NextRequest) {
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
        await login({ id: user.id, username: user.username, role: user.role });

        return NextResponse.json({
            message: '注册成功',
            user: { id: user.id, username: user.username, role: user.role }
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
