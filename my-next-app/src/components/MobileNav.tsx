"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Bot, History, Menu, Bookmark, LayoutDashboard, Settings } from 'lucide-react';
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

const mobileNavItems = [
    { name: '首页', href: '/', icon: Home },
    { name: '练习', href: '/practice', icon: BookOpen },
    { name: 'AI对话', href: '/chat', icon: Bot },
    { name: '记录', href: '/history', icon: History },
];

const moreItems = [
    { name: '知识卡片', href: '/knowledge', icon: Bookmark, description: '管理与复习知识薄弱点' },
    { name: '知识图谱', href: '/dashboard', icon: LayoutDashboard, description: '学习掌握度可视化' },
    { name: '个人设置', href: '/settings', icon: Settings, description: '偏好与数据管理' },
];

interface MobileNavProps {
    user?: {
        username: string;
        id: number;
    } | null;
}

export function MobileNav({ user }: MobileNavProps) {
    const pathname = usePathname();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
        setMounted(true);
    }, []);

    // 基础容器样式
    const containerClasses = "md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border pb-[env(safe-area-inset-bottom)]";

    if (!mounted) {
        return (
            <div className={containerClasses}>
                <div className="flex justify-around items-center h-16 px-1">
                    <div className="w-full h-full" />
                </div>
            </div>
        );
    }

    return (
        <div className={containerClasses} suppressHydrationWarning>
            <div className="flex justify-around items-center h-16 px-1">
                {mobileNavItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive
                                ? 'text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <item.icon className={`h-5 w-5 ${isActive ? 'fill-current' : ''}`} />
                            <span className="text-[10px] font-medium">{item.name}</span>
                        </Link>
                    );
                })}

                <Drawer>
                    <DrawerTrigger asChild>
                        <button
                            type="button"
                            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${pathname.startsWith('/dashboard') || pathname.startsWith('/settings') || pathname.startsWith('/knowledge')
                                ? 'text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Menu className="h-5 w-5" />
                            <span className="text-[10px] font-medium">更多</span>
                        </button>
                    </DrawerTrigger>
                    <DrawerContent>
                        <DrawerHeader className="text-left">
                            <DrawerTitle>更多功能</DrawerTitle>
                            <DrawerDescription>
                                {user ? `当前登录: ${user.username}` : "访问知识库、查看学习进度或调整设置。"}
                            </DrawerDescription>
                        </DrawerHeader>
                        <div className="grid gap-4 p-4">
                            {moreItems.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <DrawerClose asChild key={item.href}>
                                        <Link
                                            href={item.href}
                                            className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${isActive
                                                ? "bg-primary/10 border-primary/20 text-primary"
                                                : "bg-muted/50 border-transparent hover:bg-muted"
                                                }`}
                                        >
                                            <div className={`p-2 rounded-lg ${isActive ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                                                <item.icon className="h-5 w-5" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-sm font-semibold">{item.name}</div>
                                                <div className="text-xs text-muted-foreground">{item.description}</div>
                                            </div>
                                        </Link>
                                    </DrawerClose>
                                );
                            })}
                        </div>
                        <DrawerFooter className="pt-2 flex flex-col gap-2">
                            {user ? (
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={async () => {
                                        const res = await fetch('/api/auth/logout', { method: 'POST' });
                                        if (res.ok) window.location.href = '/login';
                                    }}
                                >
                                    退出登录
                                </Button>
                            ) : (
                                <Button
                                    variant="default"
                                    className="w-full"
                                    onClick={() => window.location.href = '/login'}
                                >
                                    去登录
                                </Button>
                            )}
                            <DrawerClose asChild>
                                <Button variant="secondary" className="w-full">取消</Button>
                            </DrawerClose>
                        </DrawerFooter>
                    </DrawerContent>
                </Drawer>
            </div>
        </div>
    );
}
