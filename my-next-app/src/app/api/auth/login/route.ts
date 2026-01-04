import { NextRequest, NextResponse } from 'next/server';
import { getUserByUsername } from '@/lib/user-service';
import { comparePassword } from '@/lib/password';
import { login } from '@/lib/auth';

export async function POST(request: NextRequest) {
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
