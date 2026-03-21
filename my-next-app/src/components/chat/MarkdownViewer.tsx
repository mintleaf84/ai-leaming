'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import CodeBlock from './CodeBlock';
import 'katex/dist/katex.min.css';

interface MarkdownViewerProps {
    content: string;
    /** 是否为用户消息（影响配色） */
    isUser?: boolean;
}

/**
 * Markdown 渲染组件（独立拆分，支持 next/dynamic 懒加载）
 * 包含 GFM 表格、数学公式（KaTeX）、代码高亮等插件
 */
export default function MarkdownViewer({ content, isUser = false }: MarkdownViewerProps) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
                // 标题
                h1: ({ children }: any) => (
                    <h1 className="text-xl font-bold mt-6 mb-3 pb-2 border-b border-border">{children}</h1>
                ),
                h2: ({ children }: any) => (
                    <h2 className="text-lg font-bold mt-5 mb-2">{children}</h2>
                ),
                h3: ({ children }: any) => (
                    <h3 className="text-base font-bold mt-4 mb-2">{children}</h3>
                ),
                h4: ({ children }: any) => (
                    <h4 className="text-sm font-bold mt-3 mb-1">{children}</h4>
                ),
                // 段落
                p: ({ children }: any) => (
                    <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
                ),
                // 列表
                ul: ({ children }: any) => (
                    <ul className="list-disc list-inside mb-3 space-y-1 pl-2">{children}</ul>
                ),
                ol: ({ children }: any) => (
                    <ol className="list-decimal list-inside mb-3 space-y-1 pl-2">{children}</ol>
                ),
                li: ({ children }: any) => (
                    <li className="leading-relaxed">{children}</li>
                ),
                // 引用
                blockquote: ({ children }: any) => (
                    <blockquote className={`border-l-4 pl-4 py-2 my-3 italic ${!isUser
                        ? 'border-primary/50 bg-primary/5 text-muted-foreground'
                        : 'border-primary-foreground/30 bg-primary-foreground/10'}`}>
                        {children}
                    </blockquote>
                ),
                // 分割线
                hr: () => (
                    <hr className="my-4 border-border" />
                ),
                // 粗体
                strong: ({ children }: any) => (
                    <strong className="font-bold">{children}</strong>
                ),
                // 斜体
                em: ({ children }: any) => (
                    <em className="italic">{children}</em>
                ),
                // 代码块
                code: ({ node, inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                        <CodeBlock
                            language={match[1]}
                            value={String(children).replace(/\n$/, '')}
                        />
                    ) : (
                        <code className={`${className} px-1.5 py-0.5 rounded ${!isUser
                            ? 'bg-muted text-destructive'
                            : 'bg-primary-foreground/20 text-primary-foreground'} font-mono text-xs`} {...props}>
                            {children}
                        </code>
                    );
                },
                // 预格式化文本
                pre: ({ children }: any) => (
                    <pre className="my-3">{children}</pre>
                ),
                // 表格
                table: ({ children }: any) => (
                    <div className="overflow-x-auto my-4 rounded-lg border border-border">
                        <table className="min-w-full border-collapse">
                            {children}
                        </table>
                    </div>
                ),
                thead: ({ children }: any) => (
                    <thead className={`${!isUser ? 'bg-muted/50' : 'bg-primary-foreground/10'}`}>{children}</thead>
                ),
                th: ({ children }: any) => (
                    <th className="border-b border-border px-4 py-2 text-left font-semibold opacity-90">
                        {children}
                    </th>
                ),
                td: ({ children }: any) => (
                    <td className="border-b border-border px-4 py-2">
                        {children}
                    </td>
                ),
                // 链接
                a: ({ children, href }: any) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className={`underline decoration-1 underline-offset-2 ${!isUser
                        ? 'text-primary hover:text-primary/80'
                        : 'text-primary-foreground/80 hover:text-primary-foreground'}`}>
                        {children}
                    </a>
                ),
                // 图片
                img: ({ src, alt }: any) => (
                    <img src={src} alt={alt} className="max-w-full h-auto rounded-lg my-3 shadow-sm" />
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    );
}
