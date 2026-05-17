"use client";

import React from 'react';
import { indexToLetter } from '@/lib/utils/utils';

interface OptionsListProps {
    options: string[];
    correctAnswer: string;
    userAnswer: string;
    isCorrect: boolean;
}

/**
 * 解析答案字符串（兼容单选和多选）
 * 单选: "B" -> ["B"]
 * 多选 JSON: '["A","B"]' -> ["A", "B"]
 * 多选逗号分隔: "A,B,C" -> ["A", "B", "C"]
 */
export function parseAnswer(answer: string): string[] {
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

export function OptionsList({ options, correctAnswer, userAnswer, isCorrect }: OptionsListProps) {
    const correctAnswers = parseAnswer(correctAnswer);
    const userAnswers = parseAnswer(userAnswer);

    return (
        <div className="mt-3 space-y-2">
            {options.map((opt, oi) => {
                const letter = indexToLetter(oi);
                const isCorrectOption = correctAnswers.includes(letter) || correctAnswers.includes(opt);
                const isUserChoice = userAnswers.includes(letter) || userAnswers.includes(opt);

                return (
                    <div
                        key={oi}
                        className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                            isCorrectOption
                                ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                : isUserChoice && !isCorrect
                                    ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                                    : 'text-muted-foreground'
                        }`}
                    >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            isCorrectOption
                                ? 'bg-green-500 text-white'
                                : isUserChoice && !isCorrect
                                    ? 'bg-red-500 text-white'
                                    : 'bg-muted text-muted-foreground'
                        }`}>
                            {letter}
                        </span>
                        <span>{opt}</span>
                    </div>
                );
            })}
        </div>
    );
}
