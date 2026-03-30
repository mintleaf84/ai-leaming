"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Highlighter, Underline, Waves, Copy } from 'lucide-react';
import { fetchJson, apiClient } from '@/lib/utils/api-client';

interface Annotation {
    id?: number;
    start: number;
    end: number;
    tag: 'highlight' | 'underline' | 'wavy';
    color?: string;
}

interface AnnotatableTextProps {
    text: string;
    questionId: number;
    className?: string;
}

// 标记类型配置
const TAG_STYLES: Record<string, { className: string; color: string }> = {
    highlight: { className: 'bg-yellow-200 dark:bg-yellow-500/40', color: '#FFE066' },
    underline: { className: 'underline decoration-blue-500 decoration-2', color: '#3B82F6' },
    wavy: { className: 'underline decoration-red-500 decoration-wavy decoration-2', color: '#EF4444' },
};

/**
 * 可标注文本组件
 * 支持划词后添加高亮、下划线、波浪线标记
 */
export function AnnotatableText({ text, questionId, className }: AnnotatableTextProps) {
    const queryClient = useQueryClient();
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
    const [selectedText, setSelectedText] = useState<string>('');
    const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);

    // 使用 useQuery 加载标注数据，5 分钟缓存
    const { data: annotationData } = useQuery({
        queryKey: ['annotations', questionId],
        queryFn: () => fetchJson<{ annotations: any[] }>(`/api/annotations?questionId=${questionId}`),
        staleTime: 5 * 60 * 1000,
        enabled: !!questionId,
    });

    // 将查询结果同步到本地 state（因为增删操作需要乐观更新）
    useEffect(() => {
        if (annotationData?.annotations) {
            setAnnotations(annotationData.annotations.map((a: any) => ({
                id: a.id,
                start: a.start_offset,
                end: a.end_offset,
                tag: a.tag,
                color: a.color,
            })));
        }
    }, [annotationData]);

    // 处理文本选择
    const handleMouseUp = useCallback(() => {
        const windowSelection = window.getSelection();
        if (!windowSelection || windowSelection.isCollapsed) {
            setSelection(null);
            setSelectedText('');
            setToolbarPosition(null);
            return;
        }

        const range = windowSelection.getRangeAt(0);
        const container = containerRef.current;
        if (!container || !container.contains(range.commonAncestorContainer)) {
            return;
        }

        // 计算选区在文本中的偏移量
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(container);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const start = preSelectionRange.toString().length;
        const end = start + range.toString().length;

        if (start === end) {
            setSelection(null);
            setSelectedText('');
            setToolbarPosition(null);
            return;
        }

        setSelection({ start, end });
        setSelectedText(text.slice(start, end));

        // 设置工具栏位置
        const rect = range.getBoundingClientRect();
        setToolbarPosition({
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
        });
    }, []);

    // 添加标注
    const addAnnotation = useCallback(async (tag: 'highlight' | 'underline' | 'wavy') => {
        if (!selection) return;

        const newAnnotation: Annotation = {
            start: selection.start,
            end: selection.end,
            tag,
            color: TAG_STYLES[tag].color,
        };

        // 保存到服务器
        try {
            const res = await apiClient.post('/api/annotations', {
                questionId,
                startOffset: selection.start,
                endOffset: selection.end,
                tag,
                color: TAG_STYLES[tag].color,
            });
            const data = await res.json() as { id: number };
            
            newAnnotation.id = data.id;
            setAnnotations(prev => [...prev, newAnnotation]);
            
            // 乐观更新后刷新缓存
            queryClient.invalidateQueries({ queryKey: ['annotations', questionId] });
        } catch (error) {
            console.error('保存标注失败:', error);
        }

        setSelection(null);
        setToolbarPosition(null);
        window.getSelection()?.removeAllRanges();
    }, [selection, questionId, queryClient]);

    // 删除标注
    const deleteAnnotation = useCallback(async (id: number) => {
        try {
            await apiClient.delete(`/api/annotations?id=${id}`);
            setAnnotations(prev => prev.filter(a => a.id !== id));
            // 关键：务必刷新 React Query 缓存，否则重新进入页面或触发更新时，旧数据会重新填充 state
            queryClient.invalidateQueries({ queryKey: ['annotations', questionId] });
        } catch (error) {
            console.error('删除标注失败:', error);
        }
    }, [queryClient, questionId]);

    // 点击外部关闭工具栏
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
                setSelection(null);
                setSelectedText('');
                setToolbarPosition(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 渲染带标注的文本
    const renderAnnotatedText = () => {
        if (annotations.length === 0) {
            return text;
        }

        // 按起始位置排序
        const sorted = [...annotations].sort((a, b) => a.start - b.start);
        const parts: React.ReactNode[] = [];
        let lastEnd = 0;

        sorted.forEach((ann, idx) => {
            // 处理重叠情况：如果当前标注的开始位置早于上一个标注的结束位置，说明重叠
            // 我们目前简单处理：跳过重叠部分的绘制，优先保证文本在 UI 上不重复
            if (ann.start < lastEnd) {
                // 如果这个标注完全被上一个覆盖了，直接跳过
                if (ann.end <= lastEnd) return;
                
                // 如果只是部分重叠，目前暂时跳过整个标注，优先保证文本正确
                return; 
            }

            // 添加未标注部分
            if (ann.start > lastEnd) {
                parts.push(
                    <span key={`plain-${idx}`}>{text.slice(lastEnd, ann.start)}</span>
                );
            }

            // 添加标注部分
            const style = TAG_STYLES[ann.tag];
            parts.push(
                <span
                    key={`ann-${ann.id || idx}`}
                    className={`${style.className} cursor-pointer group relative`}
                    onClick={(e) => {
                        e.stopPropagation(); // 防止触发父容器的事件
                        e.preventDefault();
                        if (ann.id) deleteAnnotation(ann.id);
                    }}
                    title="点击删除标注"
                >
                    {text.slice(ann.start, ann.end)}
                </span>
            );

            lastEnd = ann.end;
        });

        // 添加剩余文本
        if (lastEnd < text.length) {
            parts.push(<span key="plain-last">{text.slice(lastEnd)}</span>);
        }

        return parts;
    };

    return (
        <div className="relative">
            {/* 文本内容 */}
            <div
                ref={containerRef}
                onMouseUp={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
                className={`select-text leading-relaxed whitespace-pre-wrap ${className || ''}`}
            >
                {renderAnnotatedText()}
            </div>

            {/* 浮动工具栏 */}
            {toolbarPosition && (
                <div
                    ref={toolbarRef}
                    className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-1 flex gap-1 animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        left: toolbarPosition.x,
                        top: toolbarPosition.y,
                        transform: 'translate(-50%, -100%)',
                    }}
                >
                    <button
                        onClick={() => addAnnotation('highlight')}
                        className="p-2 hover:bg-yellow-100 dark:hover:bg-yellow-500/20 rounded transition-colors"
                        title="高亮"
                    >
                        <Highlighter className="h-4 w-4 text-yellow-600" />
                    </button>
                    <button
                        onClick={() => addAnnotation('underline')}
                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded transition-colors"
                        title="下划线"
                    >
                        <Underline className="h-4 w-4 text-blue-600" />
                    </button>
                    <button
                        onClick={() => addAnnotation('wavy')}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-500/20 rounded transition-colors"
                        title="波浪线"
                    >
                        <Waves className="h-4 w-4 text-red-500" />
                    </button>
                    <div className="w-px bg-border mx-0.5" />
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(selectedText);
                            setSelection(null);
                            setSelectedText('');
                            setToolbarPosition(null);
                            window.getSelection()?.removeAllRanges();
                        }}
                        className="p-2 hover:bg-muted rounded transition-colors"
                        title="复制"
                    >
                        <Copy className="h-4 w-4 text-muted-foreground" />
                    </button>
                </div>
            )}
        </div>
    );
}
