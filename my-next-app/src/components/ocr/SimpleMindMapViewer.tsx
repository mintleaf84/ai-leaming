'use client';

import React, { useEffect, useRef, useState } from 'react';
import MindMap from 'simple-mind-map';
import Drag from 'simple-mind-map/src/plugins/Drag.js';
import KeyboardNavigation from 'simple-mind-map/src/plugins/KeyboardNavigation.js';
import RichText from 'simple-mind-map/src/plugins/RichText.js';
import MiniMap from 'simple-mind-map/src/plugins/MiniMap.js';
import { transformToMarkdown } from 'simple-mind-map/src/parse/toMarkdown.js';
import { markdownToSmm } from '@/lib/utils/mindmapConverter';

// Register plugins globally
MindMap.usePlugin(Drag)
    .usePlugin(KeyboardNavigation)
    .usePlugin(RichText)
    .usePlugin(MiniMap);

interface SimpleMindMapViewerProps {
    markdown: string;
    onChange?: (newMarkdown: string) => void;
    className?: string;
    readOnly?: boolean;
}

export function SimpleMindMapViewer({ markdown, onChange, className = '', readOnly = false }: SimpleMindMapViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const minimapRef = useRef<HTMLDivElement>(null);
    const mindMapRef = useRef<any>(null);
    
    // 我们用一个 ref 记录内部状态是否刚发生变更，避免死循环
    const isInternalUpdate = useRef(false);

    useEffect(() => {
        if (!containerRef.current) return;

        // 初始化
        const mindMap = new MindMap({
            el: containerRef.current,
            fit: true,
            theme: 'classic2', // 内置高颜值主题
            readonly: readOnly,
            // 关闭默认的水印等
            watermarkConfig: { show: false }
        });
        
        mindMapRef.current = mindMap;

        // 绑定事件：数据变化时向外触发 Markdown 同步
        mindMap.on('data_change', () => {
            if (isInternalUpdate.current) {
                isInternalUpdate.current = false;
                return;
            }
            
            const currentData = mindMap.getData();
            // simple-mind-map 自带的 markdown 导出方法
            const newMarkdown = transformToMarkdown(currentData);
            
            if (onChange) {
                onChange(newMarkdown);
            }
        });

        // initial load
        const initData = markdownToSmm(markdown);
        isInternalUpdate.current = true;
        mindMap.setData(initData);

        return () => {
            mindMap.destroy();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 处理外部传入的 markdown 变更（比如左侧代码编辑器或 AI 刚写完）
    useEffect(() => {
        if (!mindMapRef.current || !markdown) return;
        
        // 简单做一个 Diff 判断，如果外部 Markdown 传进来的和我们刚刚发出去的没有巨大变化，直接跳过
        // 为了防止编辑器焦点丢失，只有在手动明确是由外部引起的大变更时，重新 setData
        const currentData = mindMapRef.current.getData();
        const existingMD = transformToMarkdown(currentData);
        
        // 我们粗略比较去掉空格和换行后的字符串
        if (existingMD.replace(/\s/g, '') !== markdown.replace(/\s/g, '')) {
             isInternalUpdate.current = true;
             mindMapRef.current.setData(markdownToSmm(markdown));
        }
    }, [markdown]);

    return (
        <div className={`relative ${className}`}>
            <div ref={containerRef} className="absolute inset-0 w-full h-full outline-none" />
            <div 
                ref={minimapRef} 
                className="absolute bottom-4 right-4 w-48 h-32 bg-white/50 backdrop-blur-md rounded-xl border border-black/10 shadow-lg pointer-events-none opacity-0" // mini map hook, simple-mind-map 会自动找此类或需要在配置里指定
            ></div>
            {/* 提示遮罩 */}
            {!readOnly && (
                <div className="absolute top-4 right-4 bg-background/80 backdrop-blur text-muted-foreground text-xs px-3 py-1.5 rounded-full pointer-events-none shadow-sm">
                    💡 双击节点编辑文字，拖拽改变结构，Tab 新建子节点
                </div>
            )}
        </div>
    );
}
