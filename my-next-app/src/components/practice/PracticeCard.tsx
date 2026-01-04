import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Circle, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PracticeCardProps {
    question: {
        id: number;
        content: string;
        options: string[];
        type: 'single' | 'multi';
        dimension: string;
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
    // 排除法状态：存储被划掉的选项
    const [excludedOptions, setExcludedOptions] = useState<string[]>([]);

    // 当题目更换时，重置排除状态
    useEffect(() => {
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
                    <span className={`text-xs px-2 py-1 rounded font-bold ${isMulti ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                        {isMulti ? "多项选择" : "单项选择"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        认知维度: {question.dimension === 'knowledge' ? '识记' : question.dimension === 'application' ? '应用' : '理解'}
                    </span>
                </div>
                <div className="text-[10px] text-muted-foreground/50 italic">
                    提示: 点击选项右侧眼睛图标或右键可“排除”
                </div>
            </div>

            <h2 className="text-xl mb-6 font-bold leading-relaxed text-foreground">
                {question.content}
            </h2>

            <div className="grid grid-cols-1 gap-3 mb-6">
                {options.map((option, idx) => {
                    const isSelected = selectedOptions.includes(option);
                    const isExcluded = excludedOptions.includes(option);

                    return (
                        <div
                            key={idx}
                            onClick={() => !isExcluded && onOptionClick(option, isMulti ? 'multi' : 'single')}
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
                                {isMulti ? (isSelected ? <Check className="w-4 h-4" /> : <Circle className="w-4 h-4" />) : String.fromCharCode(65 + idx)}
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

            {isMulti && (
                <Button className="w-full" onClick={onSubmitMulti} size="lg">
                    确认提交
                </Button>
            )}
        </motion.div>
    );
}
