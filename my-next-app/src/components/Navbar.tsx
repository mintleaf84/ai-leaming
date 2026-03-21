"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  LayoutDashboard,
  Settings,
  Home,
  History,
  Bot,
  Bookmark,
  BookX,
  MoreHorizontal,
  ChevronDown,
  FileText,
  Book
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { LogOut, User } from 'lucide-react';

const mainNavItems = [
  { name: '首页', href: '/dashboard', icon: Home },
  { name: '智能练习', href: '/practice', icon: BookOpen },
  { name: '错题本', href: '/wrong-book', icon: BookX },
  { name: '练习记录', href: '/history', icon: History },
];

const moreNavItems = [
  { name: 'AI 助手', href: '/chat', icon: Bot },
  { name: '知识卡片', href: '/knowledge', icon: Bookmark },
  { name: '教材库', href: '/textbooks', icon: Book },
  { name: '知识图谱', href: '/knowledge-graph', icon: LayoutDashboard },
  { name: '使用文档', href: '/docs', icon: FileText },
  { name: '设置', href: '/settings', icon: Settings },
];

interface NavbarProps {
  user?: {
    username: string;
    id: number;
  } | null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

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

  if (pathname === '/') {
    return null;
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-slate-950/95 dark:supports-[backdrop-filter]:bg-slate-950/60 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2 mr-6">
              <div className="relative w-8 h-8 mr-2">
                <Image src="/logo.png" alt="琢玉 Logo" width={32} height={32} className="object-contain" />
              </div>
              <span className="hidden lg:block font-bold text-xl bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                琢玉
              </span>
            </Link>

            {/* 主要导航项 - 桌面端 */}
            <div className="hidden md:flex items-center gap-1">
              {mainNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-primary hover:bg-muted"
                      }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}

              {/* 更多功能下拉菜单 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-1 px-3 py-2 h-auto text-muted-foreground hover:text-primary">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="text-sm font-medium">更多</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {moreNavItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-2 w-full cursor-pointer ${isActive ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.name}</span>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/profile"
                  className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full hover:bg-muted transition-colors"
                >
                  <User className="h-3.5 w-3.5" />
                  <span className="max-w-[100px] truncate">{user.username}</span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  title="退出登录"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => router.push('/login')}>
                登录
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
