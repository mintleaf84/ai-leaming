"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
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
  Sparkles,
  ScanLine,
  Network,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTerminology } from "@/lib/hooks/use-terminology";

interface SidebarProps {
  userSection?: React.ReactNode;
  featureFlags?: {
    ENABLE_TEXTBOOK: boolean;
    ENABLE_NOTES: boolean;
    ENABLE_OCR_MINDMAP: boolean;
  };
}

// --- Helper Components Moved Outside to Avoid Remounting ---
const NavGroup = ({
  title,
  items,
  pathname,
}: {
  title?: string;
  items: {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    enabled?: boolean;
  }[];
  pathname: string;
}) => (
  <div className="mb-6">
    {title && (
      <h3 className="px-4 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
    )}
    <div className="space-y-1">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 mx-2 rounded-lg text-sm font-medium transition-colors group relative",
              isActive
                ? "text-primary dark:text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {isActive && (
              <motion.div
                layoutId="sidebar-active-pill"
                initial={false}
                className="absolute inset-0 bg-primary/10 dark:bg-primary/20 rounded-lg -z-10"
                transition={{
                  type: "spring",
                  stiffness: 450, // 增加刚度，使其移动更平衡
                  damping: 35, // 调整阻尼，减少回弹感
                  mass: 0.8, // 减小质量，响应更快
                }}
              />
            )}
            <item.icon
              className={cn(
                "h-4 w-4 transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span>{item.name}</span>
            {isActive && (
              <div className="ml-auto w-1 h-1 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </div>
  </div>
);

export function AppSidebar({ userSection, featureFlags }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useTerminology();

  // Hide sidebar on landing page, login, and register
  if (pathname === "/" || pathname === "/login" || pathname === "/register") {
    return null;
  }

  const mainNavItems = [
    { name: t("nav.home"), href: "/dashboard", icon: Home },
    { name: t("nav.practice"), href: "/practice", icon: BookOpen },
    { name: t("nav.wrong_book"), href: "/wrong-book", icon: BookX },
    { name: t("nav.history"), href: "/history", icon: History },
  ];

  const knowledgeItems = [
    { name: t("nav.ai_tutor"), href: "/chat", icon: Bot },
    { name: t("nav.knowledge"), href: "/knowledge", icon: Bookmark },
    {
      name: t("nav.notes"),
      href: "/notes",
      icon: FileText,
      enabled: featureFlags?.ENABLE_NOTES ?? true,
    },
    {
      name: t("nav.textbooks"),
      href: "/textbooks",
      icon: Book,
      enabled: featureFlags?.ENABLE_TEXTBOOK ?? true,
    },
    { name: t("nav.graph"), href: "/knowledge-graph", icon: LayoutDashboard },
  ].filter((item) => item.enabled !== false);

  const moreItems = [
    { name: t("nav.ocr"), href: "/ocr", icon: ScanLine },
    {
      name: t("nav.mindmap"),
      href: "/mindmap",
      icon: Network,
      enabled: featureFlags?.ENABLE_OCR_MINDMAP ?? true,
    },
  ].filter((item) => item.enabled !== false);

  const systemItems = [
    { name: t("nav.docs"), href: "/docs", icon: FileText },
    { name: t("nav.pricing"), href: "/pricing", icon: Sparkles },
    { name: t("nav.settings"), href: "/settings", icon: Settings },
  ];

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0 overflow-hidden font-sans">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative w-7 h-7">
            <Image
              src="/logo.png"
              alt="琢玉 Logo"
              width={28}
              height={28}
              className="object-contain group-hover:scale-110 transition-transform"
            />
          </div>
          <span className="font-bold text-lg bg-gradient-to-r from-emerald-700 to-teal-700 bg-clip-text text-transparent font-serif md:dark:from-emerald-400 md:dark:to-teal-400">
            琢玉
          </span>
        </Link>
      </div>

      {/* Main Navigation */}
      <ScrollArea className="flex-1 py-6 scrollbar-thin">
        <NavGroup
          title={t("section.start")}
          items={mainNavItems}
          pathname={pathname}
        />
        <NavGroup
          title={t("section.knowledge")}
          items={knowledgeItems}
          pathname={pathname}
        />
        <NavGroup
          title={t("section.more")}
          items={moreItems}
          pathname={pathname}
        />
        <NavGroup
          title={t("section.system")}
          items={systemItems}
          pathname={pathname}
        />
      </ScrollArea>

      {/* Footer / User Profile Slot */}
      {userSection}
    </aside>
  );
}
