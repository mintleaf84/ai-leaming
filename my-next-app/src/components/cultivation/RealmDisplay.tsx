'use client';

import { motion } from 'framer-motion';
import { CultivationState } from '@/lib/cultivation/types';
import { Progress } from '@/components/ui/progress';

interface RealmDisplayProps {
  state: CultivationState;
}

export function RealmDisplay({ state }: RealmDisplayProps) {
  return (
    <div className="w-full max-w-md bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-[40px] p-10 flex flex-col items-center shadow-2xl relative">
      {/* 境界名称 */}
      <div className="relative mb-8">
        {/* 外圈流光 */}
        <motion.div
          className="absolute inset-[-20px] rounded-full border border-emerald-500/20"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-[-10px] rounded-full border border-emerald-500/40 border-dashed"
          animate={{ rotate: -360 }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        />
        
        <div className="relative flex flex-col items-center">
          <span className="text-zinc-500 text-xs tracking-[0.3em] font-bold mb-2">当前境界</span>
          <div className="flex items-baseline gap-2">
            <h3 className="text-5xl font-serif font-bold text-white tracking-tighter">
              {state.realm}
            </h3>
            <span className="text-emerald-400 font-serif text-xl font-medium">
              {state.stage}
            </span>
          </div>
        </div>
      </div>

      {/* 修为进度条 */}
      <div className="w-full space-y-3 mb-8">
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
          <span>修为积累</span>
          <span>{Math.round(state.progressToNext)}%</span>
        </div>
        <div className="relative h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
            initial={{ width: 0 }}
            animate={{ width: `${state.progressToNext}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* 描述语 */}
      <p className="text-center text-zinc-400 text-sm leading-relaxed font-light min-h-[3rem]">
        {state.description}
      </p>

      {/*数据展示 */}
      <div className="grid grid-cols-2 gap-8 mt-10 w-full pt-8 border-t border-white/5">
        <div className="text-center">
          <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">累计修为</div>
          <div className="text-xl font-serif text-zinc-200">{state.total修为}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-1">根基稳固</div>
          <div className="text-xl font-serif text-zinc-200">{state.mastery}%</div>
        </div>
      </div>
    </div>
  );
}
