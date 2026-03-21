'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Check, Copy } from 'lucide-react';

// 动态导入 react-syntax-highlighter，避免其庞大的正则库进入主 Bundle
const SyntaxHighlighter = dynamic(
    () => import('react-syntax-highlighter').then(mod => mod.Prism),
    {
        ssr: false,
        loading: () => (
            <div className="animate-pulse bg-zinc-800 rounded-b-lg p-4 min-h-[3rem]" />
        ),
    }
);

// 主题样式单独异步导入
const themePromise = import('react-syntax-highlighter/dist/esm/styles/prism').then(mod => mod.vscDarkPlus);

interface CodeBlockProps {
    language: string;
    value: string;
}

/**
 * 自定义代码块组件
 * 支持语法高亮和一键复制
 */
export default function CodeBlock({ language, value }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);
    const [theme, setTheme] = useState<Record<string, React.CSSProperties> | null>(null);

    // 懒加载主题
    React.useEffect(() => {
        themePromise.then(setTheme);
    }, []);

    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div data-testid="code-block" className="relative group my-4 rounded-lg overflow-hidden border border-border">
            {/* Language Label & Copy Button */}
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 text-zinc-300 text-xs font-mono">
                <span className="uppercase">{language || 'code'}</span>
                <button
                    onClick={handleCopy}
                    aria-label="复制代码"
                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
                >
                    {copied ? (
                        <>
                            <Check className="w-3 h-3 text-green-400" />
                            <span className="text-green-400">已复制</span>
                        </>
                    ) : (
                        <>
                            <Copy className="w-3 h-3" />
                            <span>复制</span>
                        </>
                    )}
                </button>
            </div>

            {/* Code Content */}
            {theme ? (
                <SyntaxHighlighter
                    language={language || 'text'}
                    style={theme}
                    customStyle={{
                        margin: 0,
                        padding: '1rem',
                        fontSize: '0.875rem',
                        lineHeight: '1.5',
                    }}
                    showLineNumbers={value.split('\n').length > 3}
                >
                    {value}
                </SyntaxHighlighter>
            ) : (
                <pre className="p-4 bg-zinc-900 text-zinc-300 text-sm font-mono overflow-x-auto">
                    <code>{value}</code>
                </pre>
            )}
        </div>
    );
}
