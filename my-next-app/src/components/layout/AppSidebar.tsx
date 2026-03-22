"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    BookOpen,
    LayoutDashboard,
    Settings,
    Home,
    History,
    Bot,
    Bookmark,
    BookX,
    FileText,
    Book,
    LogOut,
    Sparkles,
    ChevronsUpDown,
    Palette,
    Moon,
    Sun,
    Eye,
    Monitor
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTerminology } from "@/lib/hooks/use-terminology";

interface UserProps {
    user?: {
        username: string;
        id: number;
    } | null;
}

// --- Helper Components Moved Outside to Avoid Remounting ---
const NavGroup = ({ 
    title, 
    items, 
    pathname 
}: { 
    title?: string, 
    items: { name: string, href: string, icon: any }[],
    pathname: string 
}) => (
    <div className="mb-6">
        {title && (
            <h3 className="px-4 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {title}
            </h3>
        )}
        <div className="space-y-1">
            {items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2 mx-2 rounded-lg text-sm font-medium transition-colors group relative",
                            isActive
                                ? "text-primary dark:text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId="sidebar-active-pill"
                                initial={false}
                                className="absolute inset-0 bg-primary/10 dark:bg-primary/20 rounded-lg -z-10"
                                transition={{
                                    type: "spring",
                                    stiffness: 350,
                                    damping: 40
                                }}
                            />
                        )}
                        <item.icon className={cn(
                            "h-4 w-4 transition-colors",
                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )} />
                        <span>{item.name}</span>
                        {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-primary" />}
                    </Link>
                );
            })}
        </div>
    </div>
);

export function AppSidebar({ user }: UserProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { setTheme } = useTheme();
    const { t } = useTerminology();

    // Hide sidebar on landing page, login, and register
    if (pathname === '/' || pathname === '/login' || pathname === '/register') {
        return null;
    }

    const mainNavItems = [
        { name: t('nav.home'), href: '/dashboard', icon: Home },
        { name: t('nav.practice'), href: '/practice', icon: BookOpen },
        { name: t('nav.wrong_book'), href: '/wrong-book', icon: BookX },
        { name: t('nav.history'), href: '/history', icon: History },
    ];

    const knowledgeItems = [
        { name: t('nav.ai_tutor'), href: '/chat', icon: Bot },
        { name: t('nav.knowledge'), href: '/knowledge', icon: Bookmark },
        { name: t('nav.textbooks'), href: '/textbooks', icon: Book },
        { name: t('nav.graph'), href: '/knowledge-graph', icon: LayoutDashboard },
    ];

    const systemItems = [
        { name: t('nav.docs'), href: '/docs', icon: FileText },
        { name: t('nav.pricing'), href: '/pricing', icon: Sparkles },
        { name: t('nav.settings'), href: '/settings', icon: Settings },
    ];

    const handleLogout = async () => {
        try {
            const res = await fetch('/api/auth/logout', { method: 'POST' });
            if (res.ok) {
                router.push('/login');
                router.refresh();
            }
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    return (
        <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0 overflow-hidden font-sans">
            {/* Logo Area */}
            <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="relative w-7 h-7">
                        <Image src="/logo.png" alt="琢玉 Logo" width={28} height={28} className="object-contain group-hover:scale-110 transition-transform" />
                    </div>
                    <span className="font-bold text-lg bg-gradient-to-r from-emerald-700 to-teal-700 bg-clip-text text-transparent font-serif md:dark:from-emerald-400 md:dark:to-teal-400">
                        琢玉
                    </span>
                </Link>
            </div>

            {/* Main Navigation */}
            <ScrollArea className="flex-1 py-6 scrollbar-thin">
                <NavGroup title={t('section.start')} items={mainNavItems} pathname={pathname} />
                <NavGroup title={t('section.knowledge')} items={knowledgeItems} pathname={pathname} />
                <NavGroup title={t('section.system')} items={systemItems} pathname={pathname} />
            </ScrollArea>

            {/* Footer / User Profile */}
            <div className="p-4 border-t border-sidebar-border bg-sidebar">
                {user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-sidebar-accent cursor-pointer transition-colors group data-[state=open]:bg-sidebar-accent">
                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                                    {user.username.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-sidebar-foreground truncate">{user.username}</div>
                                    <div className="text-xs text-muted-foreground">{t('app.preparing')}</div>
                                </div>
                                <ChevronsUpDown className="w-4 h-4 text-muted-foreground group-hover:text-sidebar-foreground" />
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56" align="end" side="right" sideOffset={12}>
                            <div className="flex items-center gap-2 p-2">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                    {user.username.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="flex flex-col space-y-0.5">
                                    <span className="text-sm font-medium text-foreground">{user.username}</span>
                                    <span className="text-xs text-muted-foreground">{t('app.account_type')}</span>
                                </div>
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuGroup>
                                <DropdownMenuItem onClick={() => router.push('/settings')}>
                                    <Settings className="mr-2 h-4 w-4" />
                                    <span>{t('app.settings')}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push('/pricing')}>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    <span>{t('app.pricing')}</span>
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <Palette className="mr-2 h-4 w-4" />
                                    <span>{t('app.theme')}</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                    <DropdownMenuItem onClick={() => setTheme("light")}>
                                        <Sun className="mr-2 h-4 w-4" />
                                        <span>明亮模式</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setTheme("dark")}>
                                        <Moon className="mr-2 h-4 w-4" />
                                        <span>深色模式</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setTheme("eye-care")}>
                                        <Eye className="mr-2 h-4 w-4" />
                                        <span>护眼模式</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setTheme("system")}>
                                        <Monitor className="mr-2 h-4 w-4" />
                                        <span>跟随系统</span>
                                    </DropdownMenuItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-700 focus:bg-red-50" onClick={handleLogout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>{t('app.logout')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Link href="/login">
                        <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
                            {t('app.login')}
                        </Button>
                    </Link>
                )}
            </div>
        </aside>
    );
}
