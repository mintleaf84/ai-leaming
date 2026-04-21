'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';

export default function RegisterPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致');
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                // Redirect to dashboard on success
                router.push('/dashboard');
                router.refresh();
            } else {
                setError(data.error || '注册失败');
            }
        } catch (_err) {
            setError('无法连接到服务器');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#faf9f6] px-4 font-sans selection:bg-emerald-100 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-100/20 rounded-full blur-[100px] -z-10 pointer-events-none" />

            <Card className="w-full max-w-[400px] shadow-2xl border border-white/60 bg-white/80 backdrop-blur-xl rounded-3xl p-2">
                <CardHeader className="space-y-4 text-center pt-8 pb-4">
                    {/* Logo */}
                    <div className="mx-auto w-12 h-12 relative mb-2">
                        <Image src="/logo.png" alt="Logo" fill className="object-contain" />
                    </div>
                    <div>
                        <CardTitle className="text-3xl font-bold font-serif text-neutral-800">加入琢玉</CardTitle>
                        <CardDescription className="text-neutral-500 mt-2">
                            开启您的数字化备考修行
                        </CardDescription>
                    </div>
                </CardHeader>
                <form onSubmit={handleRegister}>
                    <CardContent className="space-y-5">
                        {error && (
                            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2 text-sm animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Input
                                type="text"
                                placeholder="用户名"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                minLength={3}
                                className="h-12 rounded-xl bg-white/50 border-neutral-200 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all text-base"
                            />
                        </div>
                        <div className="space-y-2">
                            <Input
                                type="password"
                                placeholder="设置密码 (至少6位)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="h-12 rounded-xl bg-white/50 border-neutral-200 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all text-base"
                            />
                        </div>
                        <div className="space-y-2">
                            <Input
                                type="password"
                                placeholder="确认密码"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="h-12 rounded-xl bg-white/50 border-neutral-200 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all text-base"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-6 pt-2 pb-8">
                        <Button
                            type="submit"
                            className="w-full h-12 text-base font-medium rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200/50 transition-all hover:scale-[1.02]"
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "立即注册"}
                        </Button>
                        <div className="text-center text-sm text-neutral-400">
                            已有账号？{' '}
                            <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium hover:underline underline-offset-4 transition-colors">
                                直接登录
                            </Link>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
