"use client";

import React from 'react';
import { formatDuration, cn, indexToLetter } from '@/lib/utils/utils';

interface StatsBarProps {
    correctAnswer: string;
    userAnswer: string;
    isCorrect: boolean;
    duration: number;
    options: string[];
    correctRatio?: number | null;
    mostWrongAnswer?: string | null;
}

/**
 * 解析答案字符串（兼容单选和多选）
 * 单选: "B" -> ["B"]
 * 多选 JSON: '["A","B"]' -> ["A", "B"]
 * 多选逗号分隔: "A,B,C" -> ["A", "B", "C"]
 */
function parseAnswer(answer: string): string[] {
    if (!answer) return [];
    const trimmed = answer.trim();

    // 1. JSON 数组格式 '["A","B"]'
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [answer];
        } catch {
            return [answer];
        }
    }

    // 2. 逗号分隔格式 'A,B,C' (多选题/不定项选择题)
    if (trimmed.includes(',')) {
        return trimmed.split(',').map(s => s.trim());
    }

    // 3. 单选题 / 判断题：单个值
    return [answer];
}

/**
 * 将答案值归一化为字母标号显示
 * 如果值是选项文字（非 A-Z 单字符），则通过 options 列表反查索引并转为字母
 * 例如: "10岁左右是从具体形象思维..." → 在 options 中找到索引 0 → "A"
 */
function normalizeToLetters(values: string[], options: string[]): string[] {
    if (options.length === 0) return values;
    return values.map(val => {
        // 已经是单字母标号 (A-Z)，直接返回
        if (/^[A-Z]$/.test(val)) return val;
        // 尝试在选项列表中查找，转为字母标号
        const idx = options.indexOf(val);
        if (idx !== -1) return indexToLetter(idx);
        // 无法归一化，原样返回
        return val;
    });
}

export function StatsBar({ correctAnswer, userAnswer, isCorrect, duration, options, correctRatio, mostWrongAnswer }: StatsBarProps) {
    return (
        <div className="mt-6 pt-4 border-t border-border">
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-4 text-center">
                <div>
                    <div className="text-base md:text-lg font-bold text-green-600">
                        {normalizeToLetters(parseAnswer(correctAnswer), options).join(', ') || '-'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">正确答案</div>
                </div>
                <div>
                    <div className={cn("text-base md:text-lg font-bold", isCorrect ? "text-green-600" : "text-rose-500")}>
                        {normalizeToLetters(parseAnswer(userAnswer), options).join(', ') || '未作答'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">你的答案</div>
                </div>
                {correctRatio != null && (
                    <div>
                        <div className="text-base md:text-lg font-bold text-purple-600">
                            {correctRatio}%
                        </div>
                        <div className="text-[10px] text-muted-foreground">正确率</div>
                    </div>
                )}
                <div>
                    <div className="text-base md:text-lg font-bold text-blue-600">
                        {formatDuration(duration)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">用时</div>
                </div>
                {mostWrongAnswer && (
                    <div>
                        <div className="text-base md:text-lg font-bold text-amber-600">
                            {mostWrongAnswer}
                        </div>
                        <div className="text-[10px] text-muted-foreground">易错项</div>
                    </div>
                )}
            </div>
        </div>
    );
}