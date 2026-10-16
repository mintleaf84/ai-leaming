"use client";

import React from "react";
import { Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { AnnotatableText } from "../AnnotatableText";

interface AIAnalysisSectionProps {
  fpAnalysis: string | null;
  isLoading: boolean;
  onGenerate: (force?: boolean) => void;
  questionId?: number;
}

export function AIAnalysisSection({
  fpAnalysis,
  isLoading,
  onGenerate,
  questionId,
}: AIAnalysisSectionProps) {
  return (
    <div className="p-5 bg-gradient-to-r from-amber-500/5 to-orange-500/5 border-b border-amber-500/10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
          <Lightbulb className="h-4 w-4" />
          第一性原理
        </div>
        {!fpAnalysis ? (
          <button
            onClick={() => onGenerate(false)}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full border border-amber-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                分析中...
              </>
            ) : (
              "一键解析"
            )}
          </button>
        ) : (
          <button
            onClick={() => onGenerate(true)}
            disabled={isLoading}
            className="p-1.5 text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors disabled:opacity-50"
            title="重新解析"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        )}
      </div>

      {fpAnalysis ? (
        <div className="bg-card p-4 rounded-xl border border-amber-500/20 shadow-sm">
          {questionId ? (
            <AnnotatableText
              text={fpAnalysis}
              questionId={questionId}
              className="text-sm text-foreground"
            />
          ) : (
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {fpAnalysis}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          点击上方按钮，AI 将用底层逻辑为你解析这道题（≤200字）
        </div>
      )}
    </div>
  );
}
