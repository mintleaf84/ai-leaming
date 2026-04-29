"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getKnowledgeGraphData } from '@/server/actions/viz';
import type { KnowledgeGraphData } from '@/types/viz';
import { Skeleton } from '@/components/ui/skeleton';
import { Orbit } from 'lucide-react';

// 动态导入非首屏组件，减少首屏加载时间
const KnowledgeTreeSection = dynamic(
  () => import('@/components/dashboard/KnowledgeTreeSection').then(mod => ({ default: mod.KnowledgeTreeSection })),
  {
    loading: () => (
      <div className="bg-card rounded-2xl p-6 border border-border">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    ),
    ssr: false
  }
);

const DataManagementSection = dynamic(
  () => import('@/components/dashboard/DataManagementSection').then(mod => ({ default: mod.DataManagementSection })),
  {
    loading: () => (
      <div className="mt-6 bg-card rounded-2xl p-6 border border-border">
        <Skeleton className="h-8 w-32 mb-4" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    ),
    ssr: false
  }
);

export default function DashboardPage() {
  const [data, setData] = useState<KnowledgeGraphData | null>(null);

  const loadData = async () => {
    const result = await getKnowledgeGraphData();
    if (result.data) {
        setData(result.data);
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadData();
    };
    init();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12 md:py-20 max-w-7xl">
        {/* Header */}
        <header className="flex items-center gap-5 mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-sm border border-primary/20">
            <Orbit className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground tracking-tight">知识图谱</h1>
            <p className="text-muted-foreground mt-1.5 font-sans">可视化您的知识疆域，构建完整的认知体系</p>
          </div>
        </header>

        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          {/* Tree Section */}
          <div className="bg-card rounded-[2rem] border border-border shadow-xl shadow-primary/5 p-2">
            <div className="bg-muted/50 rounded-[1.5rem] p-4 md:p-8">
              <KnowledgeTreeSection data={data} />
            </div>
          </div>

          {/* Data Manager */}
          <div className="max-w-2xl">
            <DataManagementSection onDataChange={loadData} />
          </div>
        </div>
      </div>
    </div>
  );
}
