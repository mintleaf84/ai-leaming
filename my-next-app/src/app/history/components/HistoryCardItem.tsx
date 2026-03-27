'use client';

import React from 'react';
import { 
    ChevronRight, 
    CheckCircle2, 
    Trash2, 
    Pencil, 
    Target,
    Brain,
    RotateCcw,
    FileCheck,
    Shuffle,
    Upload
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { SessionHistoryItem } from '@/server/actions/history';

// 模式配置
export const MODE_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  smart: { label: '智能刷题', icon: <Brain className="w-3.5 h-3.5" />, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  review: { label: '错题回顾', icon: <RotateCcw className="w-3.5 h-3.5" />, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  focus: { label: '专项突破', icon: <Target className="w-3.5 h-3.5" />, className: 'bg-teal-50 text-teal-700 border-teal-200' },
  exam: { label: '模拟考试', icon: <FileCheck className="w-3.5 h-3.5" />, className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  random: { label: '随机挑战', icon: <Shuffle className="w-3.5 h-3.5" />, className: 'bg-muted text-muted-foreground border-border' },
  import: { label: '外部导入', icon: <Upload className="w-3.5 h-3.5" />, className: 'bg-sky-50 text-sky-700 border-sky-200' },
};

interface HistoryCardItemProps {
    item: SessionHistoryItem;
    onExpand: (item: SessionHistoryItem) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onStartEdit: (e: React.MouseEvent, item: SessionHistoryItem) => void;
    isEditing: boolean;
    editingName: string;
    setEditingName: (name: string) => void;
    onSaveName: (e: React.SyntheticEvent, id: string) => void;
}

const HistoryCardItemComponent: React.FC<HistoryCardItemProps> = ({
    item,
    onExpand,
    onDelete,
    onStartEdit,
    isEditing,
    editingName,
    setEditingName,
    onSaveName
}) => {
    return (
        <div
            style={{ borderRadius: '1.5rem' }}
            onClick={() => onExpand(item)}
            className="group block bg-card hover:bg-primary/5 p-6 border border-border hover:border-primary/30 hover:shadow-lg cursor-pointer transition-all duration-200"
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        {item.practiceMode && MODE_CONFIG[item.practiceMode] && (
                            <span 
                                className={cn("px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase border flex items-center gap-1.5", MODE_CONFIG[item.practiceMode].className)}
                            >
                                {MODE_CONFIG[item.practiceMode].icon}
                                {MODE_CONFIG[item.practiceMode].label}
                            </span>
                        )}
                        {/* Date */}
                        <span className="text-xs text-neutral-400 font-bold uppercase tracking-widest">
                            {new Date(item.createdAt).toLocaleString('zh-CN', {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        {isEditing ? (
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <input
                                    value={editingName}
                                    onChange={e => setEditingName(e.target.value)}
                                    className="h-8 text-lg font-bold w-full max-w-[200px] bg-transparent border-b-2 border-primary focus:outline-none"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') onSaveName(e, item.id);
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group/title">
                                <h3 
                                    className="text-xl font-black text-foreground font-serif tracking-tight"
                                >
                                    {item.sessionName || "未命名练习"}
                                </h3>
                                <button
                                    onClick={e => onStartEdit(e, item)}
                                    className="opacity-100 md:opacity-0 md:group-hover/title:opacity-100 text-muted-foreground hover:text-primary transition-opacity p-1"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div 
                            className="flex items-center gap-1.5"
                        >
                            <CheckCircle2 className={cn("w-4 h-4", item.accuracy >= 60 ? "text-emerald-500" : "text-rose-500")} />
                            <span className="text-xs font-black uppercase tracking-widest">正确率</span>
                            <span className={cn("font-black text-lg", item.accuracy >= 60 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                {item.accuracy}%
                            </span>
                        </div>
                        <span className="w-1.5 h-1.5 bg-muted-foreground/20 rounded-full" />
                        <span className="font-bold text-xs opacity-60">共 {item.totalQuestions} 题</span>
                    </div>
                </div>

                <div className="flex items-center gap-3 md:gap-4 self-end md:self-center">
                    <div className="text-right">
                        <div className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1 opacity-50">Reviews</div>
                        <div className="text-2xl font-black text-amber-500 font-serif">{item.reviewCount}</div>
                    </div>

                    <div className="h-10 w-[1px] bg-border hidden md:block" />

                    <button
                        onClick={(e) => onDelete(e, item.id)}
                        className="p-2.5 text-neutral-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                        title="删除记录"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground shadow-sm transition-all text-muted-foreground">
                        <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const HistoryCardItem = React.memo(HistoryCardItemComponent);
