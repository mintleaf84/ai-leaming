'use client';

import React from 'react';
import { FileCheck } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AnalysisSection } from './AnalysisSection';

interface QuestionsListHeaderProps {
    isAnalyzing: boolean;
    analysisReport: string | null;
    showAnalysis: boolean;
    onAnalyze: () => void;
    showWrongOnly: boolean;
    onShowWrongOnlyChange: (checked: boolean) => void;
}

export const QuestionsListHeader: React.FC<QuestionsListHeaderProps> = ({
    isAnalyzing,
    analysisReport,
    showAnalysis,
    onAnalyze,
    showWrongOnly,
    onShowWrongOnlyChange
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
                <div className="flex items-center gap-3 px-5 py-2.5 bg-muted/40 rounded-2xl border border-border/50">
                    <Checkbox
                        id="wrong-only-detail"
                        checked={showWrongOnly}
                        onCheckedChange={(v) => onShowWrongOnlyChange(!!v)}
                        className="rounded-lg border-2 border-primary"
                    />
                    <Label htmlFor="wrong-only-detail" className="text-sm font-black cursor-pointer opacity-70">
                        只看错题
                    </Label>
                </div>
            </div>
        </div>
    );
};
