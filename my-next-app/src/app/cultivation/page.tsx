import { getUserStatsAction } from '@/server/actions/stats';
import { calculateCultivation } from '@/lib/cultivation/engine';
import { CultivationBackground } from '@/components/cultivation/CultivationBackground';
import { RealmDisplay } from '@/components/cultivation/RealmDisplay';
import { ActionCards } from '@/components/cultivation/ActionCards';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ChevronLeft, ScrollText } from 'lucide-react';
import { LeaderboardModal } from '@/components/cultivation/LeaderboardModal';
import { getGlobalFeatureFlag } from '@/server/actions/feature-flags';
import { redirect } from 'next/navigation';

export default async function CultivationPage() {
  const isEnabled = await getGlobalFeatureFlag('ENABLE_CULTIVATION', false);
  if (!isEnabled) {
    redirect('/dashboard');
  }

  const result = await getUserStatsAction();
  if (!result.data) redirect('/login');
  const state = calculateCultivation(result.data.totalPracticed, result.data.averageMastery);

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* 意境背景 */}
      <CultivationBackground />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 flex flex-col items-center">
        {/* 顶部按钮栏 */}
        <div className="w-full flex justify-between items-center mb-8">
          <Link href="/dashboard">
            <Button variant="ghost" className="text-zinc-400 hover:text-white hover:bg-white/10 gap-2">
              <ChevronLeft className="w-4 h-4" />
              返回凡世
            </Button>
          </Link>

          <LeaderboardModal>
            <Button variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-2 rounded-full px-6">
              <ScrollText className="w-4 h-4" />
              诸天封神榜
            </Button>
          </LeaderboardModal>
        </div>

        {/* 顶部标题 */}
        <div className="text-center mb-12 space-y-4">
          <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-emerald-100 to-emerald-500">
            琢玉成仙
          </h1>
          <p className="text-zinc-400 text-sm tracking-widest italic uppercase opacity-60">
            Polishing Soul · Ascending Path
          </p>
        </div>

        {/* 境界展示 */}
        <RealmDisplay state={state} />

        {/* 行动入口 */}
        <div className="w-full mt-16">
          <h2 className="text-zinc-500 text-xs font-bold uppercase tracking-[0.2em] mb-6 text-center">
            选择修行路径
          </h2>
          <ActionCards />
        </div>

        {/* 底部语录 */}
        <div className="mt-20 text-center max-w-md">
          <p className="text-zinc-500 text-sm italic font-serif leading-relaxed">
            “大抵心源清净，便是极乐。每一分精进，皆是雕琢神魂的苦修。”
          </p>
        </div>
      </div>
    </div>
  );
}
