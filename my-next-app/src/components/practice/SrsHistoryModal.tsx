"use client";

import React, { useState, useEffect } from 'react';
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
    History, CheckCircle2, XCircle, Calendar, Loader2
} from 'lucide-react';
import { getQuestionSrsHistoryAction, getQuestionSrsPredictionsAction } from '@/server/actions/srs';
import type { SrsHistoryEntry, SrsPrediction } from '@/lib/services/srs';
import dayjs from 'dayjs';

// If the project uses a standard UI library, I should check the Dialog component
// Based on package.json, it has @radix-ui/react-dialog

interface SrsHistoryModalProps {
    questionId: number;
    isOpen: boolean;
    onClose: () => void;
}

export function SrsHistoryModal({ questionId, isOpen, onClose }: SrsHistoryModalProps) {
    const [history, setHistory] = useState<SrsHistoryEntry[]>([]);
    const [predictions, setPredictions] = useState<SrsPrediction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            if (isOpen) {
                setLoading(true);
                const [hResult, pResult] = await Promise.all([
                    getQuestionSrsHistoryAction(questionId),
                    getQuestionSrsPredictionsAction(questionId)
                ]);
                if (hResult.data) setHistory(hResult.data);
                if (pResult.data) setPredictions(pResult.data);
                setLoading(false);
            }
        };
        loadData(); // eslint-disable-line -- loadData 是 async 函数，符合项目对 effect 中异步操作的统一处理规范
    }, [isOpen, questionId]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:rounded-3xl max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold flex items-center gap-2">
                        <History className="w-5 h-5 text-primary" />
                        记忆溯源
                    </DialogTitle>
                    <DialogDescription>
                        查看此题目的记忆成长曲线与复习预测
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="text-xs">正在追溯记忆轨迹...</span>
                    </div>
                ) : (
                    <div className="space-y-6 mt-4">
                        {/* Predictions */}
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5" />
                                复习预测 (若现在复习)
                            </h4>
                            <div className="grid grid-cols-4 gap-2">
                                {predictions.map(p => (
                                    <div key={p.rating} className="flex flex-col items-center p-2 rounded-2xl bg-muted/50 border border-border/50">
                                        <span className="text-[10px] font-medium text-muted-foreground">{p.label}</span>
                                        <span className="text-sm font-bold mt-0.5">{p.interval}d</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Timeline */}
                        <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                                <History className="w-3.5 h-3.5" />
                                复习记录 ({history.length})
                            </h4>
                            <div className="max-h-[240px] overflow-y-auto pr-2 custom-scrollbar space-y-3">
                                {history.length > 0 ? (
                                    history.slice().reverse().map((h, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/50 hover:border-primary/30 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-1.5 rounded-full ${h.isCorrect ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                                                    {h.isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold">{dayjs(h.date).format('MM-DD HH:mm')}</p>
                                                    <p className="text-[10px] text-muted-foreground">耗时: {(h.duration / 1000).toFixed(1)}s</p>
                                                </div>
                                            </div>
                                            <Badge variant="outline" className="text-[10px] h-5">
                                                {h.isCorrect ? '良好' : '忘记'}
                                            </Badge>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-xs text-muted-foreground italic">
                                        暂无复习记录，这是第一次遇见它
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
