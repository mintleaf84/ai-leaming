"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { generateDiagnosticReportAction, SessionReportData } from '@/server/actions/report';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, Clock, Target, CheckCircle2 } from 'lucide-react';
import type { RadarChartProps } from '@/components/viz/RadarChart';

const RadarChartSkeleton = () => (
    <div className="relative w-full h-[300px] flex items-center justify-center animate-pulse border border-border/50 rounded-xl bg-muted/5">
        <div className="absolute w-[280px] h-[280px] border border-slate-700/20 rounded-full" />
        <div className="absolute w-[200px] h-[200px] border border-slate-700/20 rounded-full" />
        <div className="absolute w-[120px] h-[120px] border border-slate-700/20 rounded-full" />
        <div className="absolute w-[40px] h-[40px] border border-slate-700/20 rounded-full" />
        <div className="p-4 text-xs text-slate-500 text-center font-sans">正在加载可视化组件...</div>
    </div>
);

const RadarChart = dynamic<RadarChartProps>(
  () => import('@/components/viz/RadarChart'),
  { ssr: false, loading: () => <RadarChartSkeleton /> }
);

interface ReportViewProps {
  initialData: SessionReportData;
}

export function ReportView({ initialData: reportData }: ReportViewProps) {
  const [aiReport, setAiReport] = useState<string>('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  useEffect(() => {
    async function generateAI() {
      setIsGeneratingAI(true);
      try {
        const text = await generateDiagnosticReportAction({
          totalQuestions: reportData.totalQuestions,
          correctCount: reportData.correctCount,
          errorTags: reportData.errorTags,
          avgDuration: reportData.avgDuration
        });
        setAiReport(text);
      } catch (e) {
        console.error('AI 报告生成失败:', e);
        setAiReport('AI 诊断报告生成失败，请稍后重试。');
      } finally {
        setIsGeneratingAI(false);
      }
    }
    generateAI();
  }, [reportData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 pb-20 font-sans">
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-8 text-foreground font-serif">练习结算报告</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl md:text-3xl font-bold text-foreground">{reportData.totalQuestions}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Target className="w-3 h-3" /> 总题数
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl md:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {reportData.correctCount}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 正确数
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
            <div className={`text-2xl md:text-3xl font-bold ${reportData.accuracy >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
              reportData.accuracy >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
              }`}>
              {reportData.accuracy}%
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3" /> 正确率
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl md:text-3xl font-bold text-foreground">
              {Math.round(reportData.avgDuration / 1000)}s
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> 平均耗时
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <div className="bg-slate-900 rounded-xl p-6 shadow-xl flex flex-col items-center justify-center text-white">
            <h2 className="text-lg font-semibold mb-4 text-slate-200">能力维度雷达</h2>
            <div className="w-full max-w-xs transition-all duration-700 ease-in-out">
              <RadarChart data={reportData.dimensionStats} />
            </div>
            {reportData.dimensionStats.length > 0 && (
              <div className="mt-4 text-sm text-slate-400 text-center italic">
                {(() => {
                  const weakest = reportData.dimensionStats.reduce((min, d) =>
                    d.value < min.value ? d : min
                  );
                  if (weakest.value < 60) {
                    return `您的"${weakest.axis}"能力相对薄弱（${weakest.value}%），建议加强相关练习。`;
                  } else if (weakest.value < 80) {
                    return `整体表现均衡，"${weakest.axis}"维度（${weakest.value}%）仍有提升空间。`;
                  } else {
                    return '🎉 各维度表现优秀，继续保持！';
                  }
                })()}
              </div>
            )}
          </div>

          <div className="bg-card rounded-xl p-6 shadow-lg border border-border relative overflow-hidden">
             <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-20"></div>
            <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center">
              <span className="bg-emerald-500 w-1.5 h-6 mr-3 rounded-full"></span>
              AI 智能诊断
            </h2>

            {isGeneratingAI ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-full"></div>
                <div className="h-4 bg-muted rounded w-5/6"></div>
              </div>
            ) : (
              <div className="prose prose-slate dark:prose-invert text-muted-foreground text-sm leading-relaxed max-w-none">
                {aiReport.split('\n').map((line, i) => (
                  <p key={i} className="mb-2 last:mb-0">{line}</p>
                ))}
              </div>
            )}

            {reportData.errorTags.length > 0 && (
              <div className="mt-6 pt-4 border-t border-border">
                <h3 className="text-sm font-medium text-foreground mb-3">待强化知识点</h3>
                <div className="flex flex-wrap gap-2">
                  {reportData.errorTags.slice(0, 5).map((tag, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 text-xs bg-red-500/10 text-red-600 dark:text-red-400 rounded-full border border-red-500/20"
                    >
                      {tag}
                    </span>
                  ))}
                  {reportData.errorTags.length > 5 && (
                    <span className="px-2 py-1 text-xs text-muted-foreground">
                      +{reportData.errorTags.length - 5} 个
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-end">
          <Button variant="outline" className="rounded-full px-6" onClick={() => window.location.href = '/history'}>
            查看历史记录
          </Button>
          <Button className="rounded-full px-6 bg-emerald-600 hover:bg-emerald-700" onClick={() => window.location.href = '/dashboard'}>
            返回仪表盘
          </Button>
        </div>
      </div>
    </div>
  );
}
