'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Users,
    BookOpen,
    Settings,
    Activity,
    LayoutDashboard,
    LogOut,
    Cpu,
    Menu,
    X,
    CreditCard,
    Key
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function AdminLayoutShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const menuItems = [
        { href: '/admin', label: '概览', icon: LayoutDashboard },
        { href: '/admin/users', label: '用户管理', icon: Users },
        { href: '/admin/plans', label: '套餐管理', icon: CreditCard },
        { href: '/admin/questions', label: '题库管理', icon: BookOpen },
        { href: '/admin/ai', label: 'AI 与提示词', icon: Cpu },
        { href: '/admin/system', label: '系统运维', icon: Activity },
        { href: '/admin/api-keys', label: 'API Key 管理', icon: Key },
        { href: '/admin/logs', label: '操作日志', icon: Settings },
    ];

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            router.push('/login');
            router.refresh();
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const NavContent = () => (
        <>
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? 'bg-primary text-primary-foreground shadow-md'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-border space-y-2">
                <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full justify-start gap-2" >
                        <LogOut className="w-4 h-4 mr-2 rotate-180" />
                        返回前台
                    </Button>
                </Link>
                <Button variant="ghost" className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    退出登录
                </Button>
            </div>
        </>
    );

    return (
        <div className="flex h-screen bg-muted/20 overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="w-64 bg-card border-r border-border flex flex-col hidden md:flex shrink-0">
                <div className="p-6 border-b border-border">
                    <h1 className="text-xl font-bold flex items-center gap-2 text-primary">
                        <Settings className="w-6 h-6" />
                        管理后台
                    </h1>
                    <p className="text-xs text-muted-foreground mt-1">系统管理中心</p>
                </div>
                <NavContent />
            </aside>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            <aside className={`fixed inset-y-0 left-0 w-64 bg-card border-r border-border z-50 transition-transform duration-300 transform md:hidden flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2 text-primary">
                            <Settings className="w-6 h-6" />
                            管理后台
                        </h1>
                        <p className="text-xs text-muted-foreground mt-1">系统管理中心</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>
                <NavContent />
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Mobile Header */}
                <header className="h-16 border-b border-border bg-card flex items-center px-4 md:hidden shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
                        <Menu className="w-6 h-6" />
                    </Button>
                    <h1 className="ml-4 font-bold text-lg text-primary flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        管理后台
                    </h1>
                </header>

                <main className="flex-1 overflow-y-auto overflow-x-hidden">
                    <div className="h-full">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
