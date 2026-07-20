"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getLeaderboardAction } from "@/server/actions/cultivation";
import { LeaderboardEntry } from "@/lib/cultivation/types";
import { LeaderboardItem } from "./LeaderboardItem";
import { Loader2, ScrollText, Sparkles } from "lucide-react";

interface LeaderboardModalProps {
  children: React.ReactNode;
}

export function LeaderboardModal({ children }: LeaderboardModalProps) {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getLeaderboardAction();
      setData(result);
    } catch (error) {
      console.error("加载封神榜失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md bg-zinc-950 border-emerald-500/20 text-zinc-100 rounded-[32px] overflow-hidden p-0 gap-0">
        <DialogHeader className="p-8 pb-4 bg-gradient-to-b from-emerald-500/10 to-transparent">
          <DialogTitle className="flex items-center gap-3 text-2xl font-serif font-bold tracking-widest text-emerald-100">
            <ScrollText className="w-6 h-6 text-emerald-500" />
            诸天封神榜
          </DialogTitle>
          <p className="text-zinc-500 text-xs mt-1 font-sans tracking-wider uppercase opacity-60">
            Celestial Records of Ascended Spirits
          </p>
        </DialogHeader>

        <div className="px-4 pb-8">
          {loading ? (
            <div className="h-[400px] flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-zinc-500 text-sm italic font-serif">
                正从虚空中打捞榜单...
              </p>
            </div>
          ) : data.length > 0 ? (
            <ScrollArea className="h-[450px] pr-4 custom-scrollbar">
              <div className="space-y-2 py-2">
                {data.map((entry, index) => (
                  <LeaderboardItem
                    key={entry.userId}
                    entry={entry}
                    rank={index + 1}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center text-zinc-600 gap-3">
              <Sparkles className="w-12 h-12 opacity-10" />
              <p className="text-sm italic">尚无大道留痕...</p>
            </div>
          )}
        </div>

        {/* 底部装饰 */}
        <div className="h-1 bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
      </DialogContent>
    </Dialog>
  );
}
