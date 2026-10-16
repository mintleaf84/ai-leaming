"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Swords, Ghost, BookMarked, Sparkles } from "lucide-react";

const ACTIONS = [
  {
    title: "下山历练",
    subtitle: "前往练习引擎，获取修为",
    icon: Swords,
    href: "/practice",
    color: "emerald",
  },
  {
    title: "炼化心魔",
    subtitle: "复盘错题，纯净神魂",
    icon: Ghost,
    href: "/practice?mode=review",
    color: "orange",
  },
  {
    title: "研习功法",
    subtitle: "查阅知识库，参悟大道",
    icon: BookMarked,
    href: "/knowledge",
    color: "cyan",
  },
  {
    title: "道法推演",
    subtitle: "AI 深度复盘与答疑",
    icon: Sparkles,
    href: "/chat",
    color: "purple",
  },
];

export function ActionCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      {ACTIONS.map((action, index) => (
        <Link key={action.title} href={action.href}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * index }}
            whileHover={{
              scale: 1.02,
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
            className="group relative p-6 rounded-3xl bg-zinc-900/40 border border-white/5 cursor-pointer overflow-hidden"
          >
            <div className="flex items-center gap-5 relative z-10">
              <div
                className={`p-4 rounded-2xl bg-${action.color}-500/10 text-${action.color}-400 group-hover:scale-110 transition-transform`}
              >
                <action.icon className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-serif font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors">
                  {action.title}
                </span>
                <span className="text-zinc-500 text-xs">{action.subtitle}</span>
              </div>
            </div>

            {/* 渐隐背景光 */}
            <div
              className={`absolute top-0 right-0 w-32 h-32 bg-${action.color}-500/5 rounded-full blur-3xl -z-0 opacity-0 group-hover:opacity-100 transition-opacity`}
            />
          </motion.div>
        </Link>
      ))}
    </div>
  );
}
