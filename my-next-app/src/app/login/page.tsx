'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { LogIn, UserPlus, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                // Redirect to dashboard on success
                router.push('/dashboard');
                router.refresh(); // Refresh to update middleware state
            } else {
                setError(data.error || '登录失败');
            }
        } catch (err) {
            setError('无法连接到服务器');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
            <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
                <CardHeader className="space-y-1 text-center">
                    <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-2">
                        <LogIn className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">欢迎回来</CardTitle>
                    <CardDescription>
                        请输入您的账号和密码登录 AI 教招助手
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-2 rounded-lg flex items-center gap-2 text-sm animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                用户名
                            </label>
                            <Input
                                type="text"
                                placeholder="您的用户名"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                className="bg-background"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                密码
                            </label>
                            <Input
                                type="password"
                                placeholder="您的密码"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="bg-background"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button type="submit" className="w-full gap-2 py-6 text-lg" disabled={loading}>
                            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                            登录系统
                        </Button>
                        <div className="text-center text-sm text-muted-foreground w-full">
                            还没有账号？{' '}
                            <Link href="/register" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
                                立即注册 <UserPlus className="h-3 w-3" />
                            </Link>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
