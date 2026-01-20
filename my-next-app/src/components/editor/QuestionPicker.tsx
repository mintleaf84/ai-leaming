'use client';

import { useState, useEffect, useCallback } from 'react';
import { searchQuestionsAction, QuestionSummary } from '@/server/actions/question';
import { Search, Loader2, BookOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface QuestionPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (questionId: number) => void;
}

/**
 * 题目选择器弹窗
 * 用于在笔记中插入题目引用
 */
export default function QuestionPicker({ isOpen, onClose, onSelect }: QuestionPickerProps) {
    const [query, setQuery] = useState('');
    const [questions, setQuestions] = useState<QuestionSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    // 题型中文映射
    const typeLabel: Record<string, string> = {
        single_choice: '单选',
        multiple_choice: '多选',
        true_false: '判断',
    };

    // 搜索题目
    const handleSearch = useCallback(async () => {
        setLoading(true);
        setSearched(true);
        const result = await searchQuestionsAction(query, 15);
        setLoading(false);

        if (result.success && result.questions) {
            setQuestions(result.questions);
        } else {
            setQuestions([]);
        }
    }, [query]);

    // 初次打开时加载最近题目
    useEffect(() => {
        if (isOpen && !searched) {
            handleSearch();
        }
    }, [isOpen, searched, handleSearch]);

    // 关闭时重置状态
    useEffect(() => {
        if (!isOpen) {
            setQuery('');
            setQuestions([]);
            setSearched(false);
        }
    }, [isOpen]);

    // 选择题目
    const handleSelect = (questionId: number) => {
        onSelect(questionId);
        onClose();
    };

    // 键盘事件
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 遮罩 */}
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            {/* 弹窗 */}
            <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden">
                {/* 头部 */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" />
                        引用题目
                    </h3>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* 搜索栏 */}
                <div className="p-4 border-b border-border">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="搜索题目内容或知识点..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="pl-9"
                                autoFocus
                            />
                        </div>
                        <Button onClick={handleSearch} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '搜索'}
                        </Button>
                    </div>
                </div>

                {/* 结果列表 */}
                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin mr-2" />
                            搜索中...
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <BookOpen className="h-10 w-10 mb-3 opacity-50" />
                            <p>{searched ? '未找到匹配的题目' : '输入关键词搜索题目'}</p>
                        </div>
                    ) : (
                        <ul className="space-y-1">
                            {questions.map((q) => (
                                <li key={q.id}>
                                    <button
                                        onClick={() => handleSelect(q.id)}
                                        className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors group"
                                    >
                                        <div className="flex items-start gap-3">
                                            <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded bg-primary/10 text-primary">
                                                {typeLabel[q.type] || q.type}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                                                    {q.content}
                                                </p>
                                                {q.tags.length > 0 && (
                                                    <p className="mt-1 text-xs text-muted-foreground truncate">
                                                        {q.tags.join(' › ')}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                #{q.id}
                                            </span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
