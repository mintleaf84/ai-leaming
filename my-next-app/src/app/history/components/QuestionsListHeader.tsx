"use client";

import React from "react";
import { FileCheck, LayoutList, PanelsTopLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AnalysisSection } from "./AnalysisSection";

interface QuestionsListHeaderProps {
  isAnalyzing: boolean;
  analysisReport: string | null;
  showAnalysis: boolean;
  onAnalyze: () => void;
  showWrongOnly: boolean;
  onShowWrongOnlyChange: (checked: boolean) => void;
  viewMode: "list" | "card";
  onViewModeChange: (mode: "list" | "card") => void;
}

export const QuestionsListHeader: React.FC<QuestionsListHeaderProps> = ({
  isAnalyzing,
  analysisReport,
  showAnalysis,
  onAnalyze,
  showWrongOnly,
  onShowWrongOnlyChange,
  viewMode,
  onViewModeChange,
}) => {
  return (
    <div className="p-8 md:p-12 bg-background space-y-12">
      <AnalysisSection
        isAnalyzing={isAnalyzing}
        analysisReport={analysisReport}
        showAnalysis={showAnalysis}
        onAnalyze={onAnalyze}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black flex items-center gap-3 font-serif">
          <FileCheck className="w-8 h-8 text-primary" />
          答题卡明细
        </h2>
        <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-2xl border border-border/50">
          <button
            onClick={() => onViewModeChange("list")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl transition-all",
              viewMode === "list"
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutList className="w-4 h-4" />
            列表
          </button>
          <button
            onClick={() => onViewModeChange("card")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl transition-all",
              viewMode === "card"
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <PanelsTopLeft className="w-4 h-4" />
            卡片
          </button>
        </div>

        <div className="flex items-center gap-3 px-5 py-2.5 bg-muted/40 rounded-2xl border border-border/50">
          <Checkbox
            id="wrong-only-detail"
            checked={showWrongOnly}
            onCheckedChange={(v) => onShowWrongOnlyChange(!!v)}
            className="rounded-lg border-2 border-primary"
          />
          <Label
            htmlFor="wrong-only-detail"
            className="text-sm font-black cursor-pointer opacity-70"
          >
            只看错题
          </Label>
        </div>
      </div>
    </div>
  );
};
