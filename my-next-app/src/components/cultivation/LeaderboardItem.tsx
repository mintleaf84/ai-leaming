'use client';

import { LeaderboardEntry } from '@/lib/cultivation/types';
import { motion } from 'framer-motion';
import { Trophy, Medal, Star } from 'lucide-react';

interface LeaderboardItemProps {
  entry: LeaderboardEntry;
  rank: number;
}

export function LeaderboardItem({ entry, rank }: LeaderboardItemProps) {
  const isTop3 = rank <= 3;
  
  // 决定颜色
  const _getRankColor = () => {
    if (rank === 1) return 'text-amber-400';
    if (rank === 2) return 'text-zinc-300';
    if (rank === 3) return 'text-orange-400';
    return 'text-zinc-500';
  };

  const getRankIcon = () => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-amber-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-zinc-300" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-orange-400" />;
    return <span className="text-sm font-bold opacity-40">{rank}</span>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className={`group flex items-center justify-between p-4 rounded-2xl border border-transparent hover:border-white/5 hover:bg-white/5 transition-all ${isTop3 ? 'bg-white/5' : ''}`}
    >
      <div className="flex items-center gap-4">
        {/* 排名 */}
        <div className="w-8 flex justify-center">
          {getRankIcon()}
        </div>
        
        {/* 道号与境界 */}
        <div className="flex flex-col">
          <span className={`font-bold ${isTop3 ? 'text-zinc-100' : 'text-zinc-400'}`}>
            {entry.username}
          </span>
          <div className="flex items-center gap-2">
             <span className="text-[10px] text-emerald-500 font-serif">
              {entry.cultivation.realm}
            </span>
            <span className="text-[10px] text-zinc-600">
              {entry.cultivation.stage}
            </span>
          </div>
        </div>
      </div>

      {/* 修为 */}
      <div className="flex flex-col items-end">
        <div className="flex items-center gap-1.5">
          <Star className="w-3 h-3 text-zinc-500" />
          <span className="text-sm font-serif text-zinc-300">{entry.totalPracticed}</span>
        </div>
        <span className="text-[10px] text-zinc-600 uppercase tracking-tighter">累计修为</span>
      </div>
    </motion.div>
  );
}
