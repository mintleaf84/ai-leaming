"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getKnowledgeGraphData, KnowledgeGraphData } from '@/server/actions/viz';
import { Skeleton } from '@/components/ui/skeleton';

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

  const loadData = () => {
    getKnowledgeGraphData().then(setData);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-[calc(100vh-64px)] bg-background">
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-foreground">
        知识图谱
        <span className="text-muted-foreground font-normal text-lg ml-2">
          (学习掌握度可视化)
        </span>
      </h1>

      <KnowledgeTreeSection data={data} />

      <DataManagementSection onDataChange={loadData} />
    </div>
  );
}
