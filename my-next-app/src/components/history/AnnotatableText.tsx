"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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
        queryFn: () => fetchJson<{ annotations: unknown[] }>(`/api/annotations?questionId=${questionId}`),
        staleTime: 5 * 60 * 1000,
        enabled: !!questionId,
    });

    // 将查询结果同步到本地 state（因为增删操作需要乐观更新）
    useEffect(() => {
        if (annotationData?.annotations) {
            const typedAnnotations = annotationData.annotations as Array<{ id: number; startOffset: number; endOffset: number; tag: 'highlight' | 'underline' | 'wavy'; color?: string }>;
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAnnotations(typedAnnotations.map((a) => ({
                id: a.id,
                start: a.startOffset,
                end: a.endOffset,
                tag: a.tag,
                color: a.color,
            })));
        }
    }, [annotationData]);

    // 处理文本选择
    const handleMouseUp = useCallback(() => {
        const windowSelection = window.getSelection();
        if (!windowSelection || windowSelection.isCollapsed || windowSelection.rangeCount === 0) {
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

        // 直接获取选中的文本内容
        const selectedTextContent = windowSelection.toString();
        if (!selectedTextContent || selectedTextContent.trim().length === 0) {
            setSelection(null);
            setSelectedText('');
            setToolbarPosition(null);
            return;
        }

        // 遍历容器内所有文本节点，累加字符数，精确计算选区在原始 text 中的偏移
        // 这种方法能够正确处理重复文本和 DOM 被标注 span 拆分的情况
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let start = -1;
        let end = -1;
        let offset = 0;
        let node: Node | null;

        while ((node = walker.nextNode())) {
            const nodeText = node.textContent || '';
            const nodeLength = nodeText.length;
            
            // 检查起始节点
            if (node === range.startContainer) {
                start = offset + range.startOffset;
            }
            
            // 检查结束节点
            if (node === range.endContainer) {
                end = offset + range.endOffset;
                if (start !== -1) break; // start 已找到，可以提前退出
            }
            
            offset += nodeLength;
        }

        // 如果 start 和 end 都找到了，验证有效性
        if (start !== -1 && end !== -1 && start < end && start >= 0 && end <= text.length) {
            setSelection({ start, end });
            setSelectedText(text.slice(start, end));

            // 设置工具栏位置
            const rect = range.getBoundingClientRect();
            setToolbarPosition({
                x: rect.left + rect.width / 2,
                y: rect.top - 10,
            });
        } else {
            // fallback: 使用 indexOf 方法
            const fullText = container.textContent || '';
            const selectedStart = fullText.indexOf(selectedTextContent);
            
            if (selectedStart !== -1) {
                const start = selectedStart;
                const end = selectedStart + selectedTextContent.length;
                
                if (start >= 0 && end <= text.length && start < end) {
                    setSelection({ start, end });
                    setSelectedText(text.slice(start, end));

                    const rect = range.getBoundingClientRect();
                    setToolbarPosition({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 10,
                    });
                    return;
                }
            }
            
            setSelection(null);
            setSelectedText('');
            setToolbarPosition(null);
        }
    }, [text]);

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

            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`服务器返回了非 JSON 响应 (${res.status})`);
            }

            const data = await res.json() as { id: number };

            newAnnotation.id = data.id;
            setAnnotations(prev => [...prev, newAnnotation]);

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
            // 如果工具栏不存在，直接返回
            if (!toolbarRef.current) return;
            
            // 检查点击是否在工具栏外部
            const isClickInsideToolbar = toolbarRef.current.contains(e.target as Node);
            if (isClickInsideToolbar) return;
            
            // 点击外部，关闭工具栏
            setSelection(null);
            setSelectedText('');
            setToolbarPosition(null);
        };
        
        // 使用 capture 阶段监听，确保能正确处理
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
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
            // 处理重叠情况：如果当前标注的结束位置早于或等于上一个标注的结束位置，说明完全被覆盖
            if (ann.end <= lastEnd) {
                return; // 完全覆盖，跳过
            }

            // 如果当前标注的起始位置小于 lastEnd，说明部分重叠
            // 采用"后来居上"原则：重叠部分显示当前标注的样式，跳过已经绘制的部分
            const effectiveStart = Math.max(ann.start, lastEnd);
            
            // 添加标注前的普通文本（如果有）
            // 注意：这里只在 ann.start > lastEnd 时才添加，因为 lastEnd 之前的文本已经被绘制
            if (ann.start > lastEnd) {
                parts.push(
                    <span key={`plain-${idx}`}>{text.slice(lastEnd, ann.start)}</span>
                );
            }

            // 添加标注部分（从 effectiveStart 到 ann.end）
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
                    {text.slice(effectiveStart, ann.end)}
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

            {/* 浮动工具栏 — 使用 Portal 渲染到 body，避免祖先元素的 CSS transform 破坏 fixed 定位 */}
            {toolbarPosition && typeof document !== 'undefined' && createPortal(
                <div
                    ref={toolbarRef}
                    className="fixed z-50 bg-card border border-border rounded-lg shadow-lg p-1 flex gap-1 animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        left: `${toolbarPosition.x}px`,
                        top: `${toolbarPosition.y}px`,
                        transform: 'translate(-50%, -100%)',
                    }}
                    onMouseDown={(e) => {
                        // 阻止 mousedown 默认行为，防止选区被清除
                        e.preventDefault();
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
                </div>,
                document.body
            )}
        </div>
    );
}
