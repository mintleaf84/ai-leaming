"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTerminology } from "@/lib/hooks/use-terminology";
import { cn } from "@/lib/utils";
import { Home, BookOpen, Book, Bot, FileText } from "lucide-react";

interface UserProps {
  user?: {
    username: string;
    id: number;
  } | null;
  featureFlags?: {
    ENABLE_TEXTBOOK: boolean;
    ENABLE_NOTES: boolean;
  };
}

export function MobileNav({ user: _user, featureFlags }: UserProps) {
  const pathname = usePathname();
  const { t } = useTerminology();

  // Hide on login/register pages
  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  const navItems = [
    { name: t("nav.home"), href: "/dashboard", icon: Home },
    { name: t("nav.practice"), href: "/practice", icon: BookOpen },
    { name: "AI 助手", href: "/chat", icon: Bot },
    {
      name: t("nav.notes"),
      href: "/notes",
      icon: FileText,
      enabled: featureFlags?.ENABLE_NOTES ?? true,
    },
    { name: t("nav.knowledge"), href: "/knowledge", icon: Book },
  ].filter((item) => item.enabled !== false);

  return (
    <nav className="md:hidden fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-6 right-6 z-50 bg-card/95 backdrop-blur-md rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/30 border border-border ring-1 ring-border/50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full gap-1 transition-all duration-300",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div
                className={cn(
                  "relative p-1.5 rounded-xl transition-all duration-300",
                  isActive ? "bg-emerald-100/50 transform -translate-y-1" : "",
                )}
              >
                <item.icon
                  className={cn("w-5 h-5", isActive && "fill-current")}
                />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-500 rounded-full" />
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium transition-all duration-300",
                  isActive ? "scale-105 font-bold" : "scale-100",
                )}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
