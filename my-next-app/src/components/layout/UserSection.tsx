"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Settings,
  LogOut,
  Sparkles,
  ChevronsUpDown,
  Palette,
  Moon,
  Sun,
  Eye,
  Monitor,
} from "lucide-react";
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
import { useTerminology } from "@/lib/hooks/use-terminology";

interface UserSectionProps {
  user: {
    username: string;
    id: number;
  } | null;
}

export function UserSection({ user }: UserSectionProps) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { t } = useTerminology();

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        router.push("/login");
        router.refresh();
      }
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (!user) {
    return (
      <div className="p-4 border-t border-sidebar-border bg-sidebar">
        <Link href="/login" className="block w-full">
          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
            {t("app.login")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-sidebar-border bg-sidebar">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-sidebar-accent cursor-pointer transition-colors group data-[state=open]:bg-sidebar-accent">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-sidebar-foreground truncate">
                {user.username}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("app.preparing")}
              </div>
            </div>
            <ChevronsUpDown className="w-4 h-4 text-muted-foreground group-hover:text-sidebar-foreground" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56"
          align="end"
          side="right"
          sideOffset={12}
        >
          <div className="flex items-center gap-2 p-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
              {user.username.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex flex-col space-y-0.5">
              <span className="text-sm font-medium text-foreground">
                {user.username}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("app.account_type")}
              </span>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              <span>{t("app.settings")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/pricing")}>
              <Sparkles className="mr-2 h-4 w-4" />
              <span>{t("app.pricing")}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              <span>{t("app.theme")}</span>
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
          <DropdownMenuItem
            className="text-red-600 focus:text-red-700 focus:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>{t("app.logout")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
