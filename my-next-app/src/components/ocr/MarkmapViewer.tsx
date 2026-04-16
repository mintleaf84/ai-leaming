'use client';

import React, { useEffect, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { Toolbar } from 'markmap-toolbar';
import { Download, Code, FileImage, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import 'markmap-toolbar/dist/style.css';
import { createNoteAction } from '@/server/actions/note';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export interface MarkmapViewerProps {
    markdown: string;
    className?: string;
    fileName?: string;
}

const transformer = new Transformer();

export function MarkmapViewer({ markdown, className = '', fileName = '' }: MarkmapViewerProps) {
    const router = useRouter();
    const svgRef = useRef<SVGSVGElement>(null);
    const mmRef = useRef<Markmap | null>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!svgRef.current) return;

        // 1. 解析 Markdown 获取 node 结构
        const { root, features } = transformer.transform(markdown);

        // 2. 初始化或更新 Markmap 实例
        if (mmRef.current) {
            mmRef.current.setData(root);
            mmRef.current.fit();
        } else {
            const mm = Markmap.create(svgRef.current, {
                // 可在此处调整导图颜色、间距等
                color: (node) => {
                    // 简单的按层级给颜色，或者返回一个固定数组
                    const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'];
                    return colors[node.depth % colors.length];
                },
                // 为了避免过密，增加一点间距
                nodeMinHeight: 20,
                spacingHorizontal: 80,
                spacingVertical: 8,
            }, root);
            mmRef.current = mm;

            // 3. 挂载 Toolbar（仅挂载一次）
            if (toolbarRef.current) {
                const toolbar = new Toolbar();
                toolbar.attach(mm);
                toolbar.setItems([...Toolbar.defaultItems]);
                toolbarRef.current.appendChild(toolbar.render());
            }
        }
    }, [markdown]);

    // 下载为交互式 HTML (推荐，样式最完整且支持交互)
    const handleDownloadHtml = () => {
        const { root } = transformer.transform(markdown);
        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>知识点思维导图</title>
<style>
* { margin: 0; padding: 0; }
body { font-family: sans-serif; }
#mindmap { display: block; width: 100vw; height: 100vh; }
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/markmap-toolbar@0.17.0/dist/style.css">
</head>
<body>
<svg id="mindmap"></svg>
<script src="https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/markmap-view@0.17.0/dist/browser/index.js"></script>
<script src="https://cdn.jsdelivr.net/npm/markmap-toolbar@0.17.0/dist/browser/index.js"></script>
<script>
  // 注入数据
  const markmapData = ${JSON.stringify(root)};
  
  // 渲染
  const { Markmap, loadCSS, loadJS } = window.markmap;
  const mm = Markmap.create('svg#mindmap', {
      color: (node) => {
          const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'];
          return colors[node.depth % colors.length];
      },
      nodeMinHeight: 20,
      spacingHorizontal: 80,
      spacingVertical: 8,
  }, markmapData);
  
  // 工具栏
  const { Toolbar } = window.markmap;
  const toolbar = new Toolbar();
  toolbar.attach(mm);
  toolbar.setItems([...Toolbar.defaultItems]);
  const el = toolbar.render();
  el.style.position = 'absolute';
  el.style.bottom = '1rem';
  el.style.right = '1rem';
  document.body.append(el);
</script>
</body>
</html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '思维导图_交互网页版.html';
        a.click();
        URL.revokeObjectURL(url);
    };

    // 下载为静态 SVG 图片
    const handleDownloadSvg = () => {
        if (!svgRef.current) return;
        // 获取 SVG 内容并加上 XML 命名空间
        const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '思维导图.svg';
        a.click();
        URL.revokeObjectURL(url);
    };

    // 保存到我的笔记的云端数据库
    const handleSaveToNote = async () => {
        const title = fileName ? `${fileName.replace(/\.[^/.]+$/, "")} (导图)` : '未命名思维导图';
        const loadingToast = toast.loading('正在保存中...');
        try {
            const result = await createNoteAction({ title, content: markdown });
            if (result.success && result.noteId) {
                toast.success('已保存到我的笔记', { 
                    id: loadingToast,
                    action: {
                        label: '前往查看',
                        onClick: () => router.push(`/notes/${result.noteId}`)
                    }
                });
            } else {
                toast.error(result.message || '保存失败', { id: loadingToast });
            }
        } catch (error) {
            toast.error('保存过程中出错', { id: loadingToast });
        }
    };

    return (
        <div className={`relative w-full h-full min-h-[500px] bg-background border border-border rounded-xl flex flex-col overflow-hidden ${className}`}>
            {/* 顶部工具栏：下载选项 */}
            <div className="absolute top-4 right-4 z-10 flex gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 shadow-sm bg-background/80 backdrop-blur-md">
                            <Download className="w-4 h-4 mr-2" />
                            保存导出
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleSaveToNote} className="cursor-pointer mb-1 bg-primary/5">
                            <Save className="w-4 h-4 mr-2 text-primary" />
                            <div className="flex flex-col">
                                <span className="font-medium">保存到我的笔记</span>
                                <span className="text-[10px] text-muted-foreground mt-0.5">云端存储，跨端同步，可在笔记库回顾</span>
                            </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadHtml} className="cursor-pointer">
                            <Code className="w-4 h-4 mr-2 text-primary" />
                            <div className="flex flex-col">
                                <span>交互式网页 (.html)</span>
                                <span className="text-[10px] text-muted-foreground mt-0.5">推荐：可展开折叠，保留所有功能</span>
                            </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadSvg} className="cursor-pointer mt-1">
                            <FileImage className="w-4 h-4 mr-2 text-emerald-500" />
                            <div className="flex flex-col">
                                <span>静态矢量图 (.svg)</span>
                                <span className="text-[10px] text-muted-foreground mt-0.5">适合插入到 PPT 或文档中</span>
                            </div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* SVG 容器 */}
            <svg ref={svgRef} className="flex-1 w-full h-full select-none" />
            <div 
                ref={toolbarRef} 
                className="absolute bottom-4 right-4 bg-card shadow-sm border border-border rounded opacity-80 hover:opacity-100 transition-opacity"
            />
        </div>
    );
}
