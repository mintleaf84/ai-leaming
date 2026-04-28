import React, { Suspense } from 'react';
import { getSessionReportAction } from '@/server/actions/report';
import { ReportView } from './ReportView';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';
import { redirect } from 'next/navigation';

interface PageProps {
  searchParams: Promise<{ sessionId?: string }>;
}

async function ReportContainer({ searchParams }: { searchParams: Promise<{ sessionId?: string }> }) {
  const { sessionId } = await searchParams;
  const res = await getSessionReportAction(sessionId);
  const reportData = res?.data;

  if (!reportData) {
    // 如果没有数据，且没有传 sessionId，可能用户没做过练习，引导去练习
    if (!sessionId) {
      redirect('/practice/setup');
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <p className="text-lg text-muted-foreground">未找到练习记录，请先完成一次练习。</p>
        <div className="mt-4 flex gap-3">
          <Button variant="outline" asChild>
            <a href="/dashboard">返回首页</a>
          </Button>
          <Button asChild>
            <a href="/practice/setup">开始练习</a>
          </Button>
        </div>
      </div>
    );
  }

  return <ReportView initialData={reportData} />;
}

export default function ReportPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p>正在初始化报告...</p>
      </div>
    }>
      <ReportContainer searchParams={searchParams} />
    </Suspense>
  );
}