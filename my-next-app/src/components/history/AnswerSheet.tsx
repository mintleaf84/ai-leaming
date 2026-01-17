"use client";

import React from 'react';
import { Grid3X3, X } from 'lucide-react';

interface AnswerSheetProps {
    logs: { isCorrect: boolean }[];
    isOpen: boolean;
    onToggle: () => void;
    onSelect: (idx: number) => void;
}

/**
 * 悬浮答题卡组件
 * 显示题目网格，绿色正确/红色错误，点击可跳转
 */
export function AnswerSheet({ logs, isOpen, onToggle, onSelect }: AnswerSheetProps) {
    const correctCount = logs.filter(l => l.isCorrect).length;
    const wrongCount = logs.filter(l => !l.isCorrect).length;

    return (
        <div className="fixed bottom-24 right-6 md:bottom-6 z-50">
            {/* 展开的答题卡 */}
            {isOpen && (
                <div className="mb-3 bg-card rounded-2xl shadow-2xl border border-border w-80 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
                    {/* 头部 */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Grid3X3 className="h-4 w-4 text-primary" />
                            答题卡
                        </h3>
                        <div className="flex items-center gap-4 text-xs">
                            <span className="flex items-center gap-1">
                                <span className="w-3 h-3 rounded bg-green-500"></span>
                                {correctCount}
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-3 h-3 rounded bg-red-500"></span>
                                {wrongCount}
                            </span>
                        </div>
                    </div>

                    {/* 题目网格 */}
                    <div className="p-3 max-h-64 overflow-y-auto">
                        <div className="grid grid-cols-8 gap-1.5">
                            {logs.map((log, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onSelect(idx)}
                                    className={`w-8 h-8 rounded-md text-xs font-bold text-white transition-all hover:scale-110 hover:shadow-md ${log.isCorrect
                                        ? 'bg-green-500 hover:bg-green-600'
                                        : 'bg-red-500 hover:bg-red-600'
                                        }`}
                                >
                                    {idx + 1}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 悬浮按钮 */}
            <button
                onClick={onToggle}
                className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 ${isOpen
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-primary hover:bg-primary/10'
                    }`}
            >
                {isOpen ? (
                    <X className="h-6 w-6" />
                ) : (
                    <Grid3X3 className="h-6 w-6" />
                )}
            </button>
        </div>
    );
}
