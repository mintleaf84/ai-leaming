'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { User, Bot, Copy, Check, Trash2, Bookmark, Loader2, Star } from 'lucide-react';
import ThinkingBlock from './ThinkingBlock';
import CodeBlock from './CodeBlock';
import { useSmoothStream } from '@/hooks/use-smooth-stream';
import 'katex/dist/katex.min.css';

interface ChatMessageProps {
    message: {
        id: string;
        role: string;
        content: string;
    };
    isLast: boolean;
    isLoading: boolean;
    onDelete?: () => void;
    onSaveToKnowledge?: (content: string) => void | Promise<void>;
    onToggleFavorite?: (messageId: number, isFavorite: boolean) => void | Promise<void>;
}

/**
 * 移植自 Cherry Studio 的消息渲染组件
 * 支持解析 <think> 标签，并为最后一条助手消息提供平滑流式输出效果
 */
export default function ChatMessage({ message, isLast, isLoading, onDelete, onSaveToKnowledge, onToggleFavorite }: ChatMessageProps) {
    const isAssistant = message.role === 'assistant';
    const [copied, setCopied] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // 用于平滑显示的内部状态
    const [displayedContent, setDisplayedContent] = useState(isLast && isAssistant ? '' : message.content);
    const lastRawContentRef = useRef(isLast && isAssistant ? '' : message.content);

    const { addChunk, reset } = useSmoothStream({
        onUpdate: (text) => setDisplayedContent(text),
        streamDone: !isLoading,
        minDelay: 15,
    });

    // 处理流式输出的增量更新
    useEffect(() => {
        if (isLast && isAssistant) {
            const newContent = message.content;
            const oldContent = lastRawContentRef.current;

            if (newContent.length > oldContent.length) {
                // 提取新增部分并加入平滑队列
                const chunk = newContent.slice(oldContent.length);
                addChunk(chunk);
                lastRawContentRef.current = newContent;
            } else if (newContent.length < oldContent.length) {
                // 如果内容被重置（某些模型重试的情况）
                reset(newContent);
                lastRawContentRef.current = newContent;
            }

            // 如果已经停止加载，确保最终内容完全同步
            if (!isLoading && displayedContent !== newContent) {
                setDisplayedContent(newContent);
                lastRawContentRef.current = newContent;
            }
        }
    }, [message.content, isLast, isAssistant, addChunk, reset, isLoading, displayedContent]);

    // 复制消息内容
    const handleCopy = () => {
        navigator.clipboard.writeText(mainText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // 保存为知识卡片
    const handleSaveToKnowledge = async () => {
        if (!onSaveToKnowledge || saving || saved) return;
        setSaving(true);
        try {
            await onSaveToKnowledge(message.content);
            setSaved(true);
        } catch (e) {
            console.error('保存知识卡片失败:', e);
        } finally {
            setSaving(false);
        }
    };

    // 解析内容：区分思考内容和正文内容
    const [thinking, mainText] = useMemo(() => {
        const content = isLast && isAssistant ? displayedContent : message.content;
        const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);

        if (thinkMatch) {
            const thinkingPart = thinkMatch[1];
            const mainPart = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trim();
            return [thinkingPart, mainPart];
        }

        return [null, content];
    }, [message.content, displayedContent, isLast, isAssistant]);

    return (
        <div
            id={`message-${message.id}`}
            className={`flex w-full ${!isAssistant ? 'justify-end' : 'justify-start'} scroll-mt-24`}
        >
            <div className={`flex max-w-[80%] md:max-w-[70%] items-start gap-4 ${!isAssistant ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${!isAssistant ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                    {!isAssistant ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                </div>

                {/* Message Content Area */}
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                    {/* Thinking Block */}
                    {thinking !== null && (
                        <ThinkingBlock
                            content={thinking}
                            isThinking={isAssistant && isLast && isLoading && !message.content.includes('</think>')}
                        />
                    )}

                    {/* Main Text Bubble */}
                    {mainText && (
                        <div className="group/message">
                            <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed border ${!isAssistant
                                ? 'bg-primary text-primary-foreground border-primary rounded-tr-none'
                                : 'bg-card text-card-foreground border-border rounded-tl-none'
                                }`}>
                                {/* Markdown 渲染 */}
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
                                            <blockquote className={`border-l-4 pl-4 py-2 my-3 italic ${!isAssistant
                                                ? 'border-primary-foreground/30 bg-primary-foreground/10'
                                                : 'border-primary/50 bg-primary/5 text-muted-foreground'}`}>
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
                                                <code className={`${className} px-1.5 py-0.5 rounded ${!isAssistant
                                                    ? 'bg-primary-foreground/20 text-primary-foreground'
                                                    : 'bg-muted text-destructive'} font-mono text-xs`} {...props}>
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
                                            <thead className={`${!isAssistant ? 'bg-primary-foreground/10' : 'bg-muted/50'}`}>{children}</thead>
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
                                            <a href={href} target="_blank" rel="noopener noreferrer" className={`underline decoration-1 underline-offset-2 ${!isAssistant
                                                ? 'text-primary-foreground/80 hover:text-primary-foreground'
                                                : 'text-primary hover:text-primary/80'}`}>
                                                {children}
                                            </a>
                                        ),
                                        // 图片
                                        img: ({ src, alt }: any) => (
                                            <img src={src} alt={alt} className="max-w-full h-auto rounded-lg my-3 shadow-sm" />
                                        ),
                                    }}
                                >
                                    {mainText}
                                </ReactMarkdown>
                                {isAssistant && isLast && isLoading && !thinking && <span className="inline-block w-1 h-3 ml-1 bg-primary animate-pulse" />}
                            </div>

                            {/* 消息操作按钮 */}
                            {!isLoading && (
                                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover/message:opacity-100 transition-opacity">
                                    {isAssistant && (
                                        <button
                                            onClick={handleCopy}
                                            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                                        >
                                            {copied ? (
                                                <>
                                                    <Check className="w-3 h-3 text-green-500" />
                                                    <span className="text-green-500">已复制</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-3 h-3" />
                                                    <span>复制</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                    {isAssistant && onToggleFavorite && (
                                        <button
                                            onClick={() => {
                                                const numericId = parseInt(message.id.replace('assistant-', ''));
                                                if (!isNaN(numericId)) {
                                                    onToggleFavorite(numericId, !(message as any).is_favorite);
                                                }
                                            }}
                                            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${(message as any).is_favorite
                                                ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/30'
                                                : 'text-muted-foreground hover:text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                                                }`}
                                        >
                                            <Star className={`w-3 h-3 ${(message as any).is_favorite ? 'fill-yellow-500' : ''}`} />
                                            <span>收藏</span>
                                        </button>
                                    )}
                                    {isAssistant && onSaveToKnowledge && (
                                        <button
                                            onClick={handleSaveToKnowledge}
                                            disabled={saving || saved}
                                            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${saved
                                                ? 'text-green-500 bg-green-50 dark:bg-green-900/30'
                                                : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                                                }`}
                                        >
                                            {saving ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    <span>提取中...</span>
                                                </>
                                            ) : saved ? (
                                                <>
                                                    <Check className="w-3 h-3" />
                                                    <span>已保存</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Bookmark className="w-3 h-3" />
                                                    <span>知识卡片</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                    {onDelete && (
                                        <button
                                            onClick={onDelete}
                                            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            <span>删除</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
