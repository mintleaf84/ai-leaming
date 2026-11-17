"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Key,
  HardDrive,
  MessageSquareWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 移动端菜单是浮层：键盘用户必须能关掉它。Esc 挂在 shell 上（document 级），
  // 不挂在遮罩上 —— 遮罩对键盘用户不可达（不可聚焦），挂上去等于没挂。
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape 是功能键，不受输入法组合态影响，无需 isImeComposing 守卫
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  const menuItems = [
    { href: "/admin", label: "概览", icon: LayoutDashboard },
    { href: "/admin/users", label: "用户管理", icon: Users },
    { href: "/admin/activity", label: "用户行为", icon: Activity }, // 使用 Activity 更有动感
    { href: "/admin/plans", label: "套餐管理", icon: CreditCard },
    { href: "/admin/questions", label: "题库管理", icon: BookOpen },
    { href: "/admin/feedback", label: "纠错反馈", icon: MessageSquareWarning },
    { href: "/admin/ai", label: "AI 与提示词", icon: Cpu },
    { href: "/admin/system", label: "系统运维", icon: Settings },
    { href: "/admin/system/backup", label: "数据备份", icon: HardDrive },
    { href: "/admin/api-keys", label: "API Key 管理", icon: Key },
    { href: "/admin/logs", label: "操作日志", icon: LayoutDashboard }, // 修改图标
  ];

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("退出登录失败", error);
      toast.error(
        `退出登录失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
  };

  const navContent = (
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
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
          <Button variant="outline" className="w-full justify-start gap-2">
            <LogOut className="w-4 h-4 mr-2 rotate-180" />
            返回前台
          </Button>
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
        >
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
        {navContent}
      </aside>

      {/* Mobile Sidebar Overlay —— 纯鼠标便捷入口：点击空白处关闭。
          键盘用户走 Esc（见上方 effect）或侧栏内的关闭按钮，所以这里
          tabIndex={-1} + aria-hidden，不额外制造一个不可见的 Tab 停靠点。 */}
      {isMobileMenuOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 md:hidden border-0 p-0 cursor-default"
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        id="admin-mobile-menu"
        className={`fixed inset-y-0 left-0 w-64 bg-card border-r border-border z-50 transition-transform duration-300 transform md:hidden flex flex-col ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-6 border-b border-border flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 text-primary">
              <Settings className="w-6 h-6" />
              管理后台
            </h1>
            <p className="text-xs text-muted-foreground mt-1">系统管理中心</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="关闭菜单"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        {navContent}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 border-b border-border bg-card flex items-center px-4 md:hidden shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="打开菜单"
            aria-expanded={isMobileMenuOpen}
            aria-controls="admin-mobile-menu"
          >
            <Menu className="w-6 h-6" />
          </Button>
          <h1 className="ml-4 font-bold text-lg text-primary flex items-center gap-2">
            <Settings className="w-5 h-5" />
            管理后台
          </h1>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
