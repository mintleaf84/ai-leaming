import { NextResponse } from 'next/server';
import { logout } from '@/lib/auth/auth';

export async function POST() {
    await logout();
    return NextResponse.json({ message: '登出成功' });
}
