import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Circle, EyeOff, Eye, CheckCircle2, XCircle, Brain, Calendar, Zap, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SrsHistoryModal } from './SrsHistoryModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getBeijingDiffDays, formatBeijingDate } from '@/lib/utils/datetime';

interface PracticeCardProps {
    question: {
        id: number;
        content: string;
        options: string[];
        type: string;  // 与 Question 类型保持一致
        dimension: string;
        srs?: {
            stability: number;
            difficulty: number;
            due_date: string;
            state: number;
            last_review?: string;
        };
    };
    isMulti: boolean;
    selectedOptions: string[];
    onOptionClick: (option: string, mode: 'single' | 'multi') => void;
    onSubmitMulti: () => void;
}

export function PracticeCard({
    question,
    isMulti,
    selectedOptions,
    onOptionClick,
    onSubmitMulti
}: PracticeCardProps) {
    // 排除法状态：存储被划掉的选项（判断题不需要此功能）
    const [excludedOptions, setExcludedOptions] = useState<string[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // 当题目更换时，重置排除状态
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExcludedOptions([]);
    }, [question.id]);

    const toggleExclude = (e: React.MouseEvent, option: string) => {
        e.preventDefault(); // 阻止默认右键菜单
        e.stopPropagation();
        setExcludedOptions(prev =>
            prev.includes(option)
                ? prev.filter(o => o !== option)
                : [...prev, option]
        );
    };

    const options = Array.isArray(question?.options) ? question.options : [];
    const isTrueFalse = question.type === 'truefalse';

    // 题型标签样式
    const typeLabel = isTrueFalse ? "判断题" : isMulti ? "多项选择" : "单项选择";
    const typeLabelClass = isTrueFalse
        ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
        : isMulti
            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400';

    const [now] = useState(() => new Date());

    return (
        <motion.div
            key="practicing"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="border border-border p-4 md:p-6 rounded shadow-sm bg-card"
        >
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded font-bold ${typeLabelClass}`}>
                        {typeLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        认知维度: {question.dimension === 'knowledge' ? '识记' : question.dimension === 'application' ? '应用' : '理解'}
                    </span>
                </div>
                {question.srs && (
                    <TooltipProvider>
                        <div className="flex items-center gap-3 bg-muted/30 px-3 py-1.5 rounded-lg border border-border/50">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 cursor-help">
                                        <Brain className="w-3.5 h-3.5 text-blue-500" />
                                        <span className="text-[10px] font-medium">{question.srs.stability.toFixed(1)}d</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="text-xs">记忆稳定性 (Stability): 数值越高代表掌握越牢固</p>
                                </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 cursor-help">
                                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                                        <span className="text-[10px] font-medium">{question.srs.difficulty.toFixed(1)}</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="text-xs">题目难度 (Difficulty): 算法感知的挑战程度 (1-10)</p>
                                </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 cursor-help">
                                        <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                                        <span className="text-[10px] font-medium">
                                            {getBeijingDiffDays(question.srs.due_date, now)}d
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="text-xs">下次复习: {formatBeijingDate(question.srs.due_date, 'YYYY/M/D')}</p>
                                </TooltipContent>
                            </Tooltip>

                            <div className="w-[1px] h-3 bg-border mx-1" />
                            <button 
                                onClick={() => setIsHistoryOpen(true)}
                                className="p-1 hover:bg-primary/10 rounded-md text-muted-foreground hover:text-primary transition-colors"
                            >
                                <History className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </TooltipProvider>
                )}
                {!isTrueFalse && !question.srs && (
                    <div className="text-[10px] text-muted-foreground/50 italic">
                        提示: 点击选项右侧眼睛图标或右键可&quot;排除&quot;
                    </div>
                )}
            </div>

            <h2 className="text-xl mb-6 font-bold leading-relaxed text-foreground">
                {question.content}
            </h2>

            {/* 判断题：渲染两个大按钮 */}
            {isTrueFalse ? (
                <div className="grid grid-cols-2 gap-4 mb-6">
                    {[
                        { letter: 'A', label: '正确', icon: <CheckCircle2 className="w-8 h-8" /> },
                        { letter: 'B', label: '错误', icon: <XCircle className="w-8 h-8" /> },
                    ].map(({ letter, label, icon }) => {
                        const isSelected = selectedOptions.includes(letter);
                        return (
                            <button
                                key={letter}
                                onClick={() => onOptionClick(letter, 'single')}
                                className={`flex flex-col items-center justify-center gap-3 py-6 rounded-xl border-2 transition-all font-bold text-lg
                                    ${isSelected
                                        ? letter === 'A'
                                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                            : 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400'
                                        : 'border-border hover:border-primary/50 bg-card text-foreground hover:bg-accent'
                                    }`}
                            >
                                {icon}
                                {label}
                            </button>
                        );
                    })}
                </div>
            ) : (
                /* 普通选择题：原有渲染逻辑 */
                <div className="grid grid-cols-1 gap-3 mb-6">
                    {options.map((option, idx) => {
                        const letter = String.fromCharCode(65 + idx);
                        const isSelected = selectedOptions.includes(letter);
                        const isExcluded = excludedOptions.includes(option);

                        return (
                            <div
                                key={idx}
                                onClick={() => !isExcluded && onOptionClick(letter, isMulti ? 'multi' : 'single')}
                                onContextMenu={(e) => toggleExclude(e, option)}
                                className={`w-full text-left p-3 md:p-4 rounded border transition-all flex items-center group relative cursor-pointer min-h-[48px]
                                    ${isExcluded ? 'opacity-40 grayscale bg-muted border-border cursor-not-allowed' :
                                        isMulti && isSelected ? 'bg-blue-500/10 border-blue-500' : 'hover:bg-accent hover:border-blue-500/30 border-border'}
                                `}
                                role="button"
                                tabIndex={0}
                            >
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 font-bold text-sm shrink-0
                                    ${isExcluded ? 'bg-muted text-muted-foreground' :
                                        isMulti && isSelected ? 'bg-blue-500 text-white' : 'bg-muted/50 text-muted-foreground group-hover:bg-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400'}
                                `}>
                                    {isMulti ? (isSelected ? <Check className="w-4 h-4" /> : <Circle className="w-4 h-4" />) : letter}
                                </span>

                                <span className={`text-foreground flex-1 ${isExcluded ? 'line-through decoration-2' : ''}`}>
                                    {option}
                                </span>

                                {/* 排除法辅助按钮 (移动端友好) */}
                                <div
                                    onClick={(e) => toggleExclude(e, option)}
                                    className={`ml-2 p-1.5 rounded-md transition-colors z-10 ${isExcluded ? 'text-blue-500 hover:bg-blue-500/10' : 'text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-accent'}`}
                                    title={isExcluded ? "恢复选项" : "排除此项"}
                                >
                                    {isExcluded ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {isMulti && (
                <Button className="w-full" onClick={onSubmitMulti} size="lg">
                    确认提交
                </Button>
            )}

            <SrsHistoryModal 
                questionId={question.id}
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
            />
        </motion.div>
    );
}
