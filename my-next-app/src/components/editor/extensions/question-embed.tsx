/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { getQuestionSummaryAction, QuestionSummary } from '@/server/actions/question';
import { BookOpen, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

/**
 * 题目引用卡片渲染组件
 */
function QuestionEmbedView({ node }: { node: any }) {
    const questionId = node.attrs.questionId;
    const [summary, setSummary] = useState<QuestionSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!questionId) {
            setLoading(false);
            setError('无效的题目 ID');
            return;
        }

        getQuestionSummaryAction(questionId).then((result) => {
            setLoading(false);
            if (result.success && result.summary) {
                setSummary(result.summary);
            } else {
                setError(result.message || '加载失败');
            }
        });
    }, [questionId]);

    // 题型中文映射
    const typeLabel: Record<string, string> = {
        single_choice: '单选题',
        multiple_choice: '多选题',
        true_false: '判断题',
    };

    return (
        <NodeViewWrapper className="question-embed-wrapper my-4" data-question-id={questionId}>
            <div className="border border-border rounded-lg bg-card hover:border-primary/50 transition-colors overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center p-6 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        加载题目中...
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center p-6 text-destructive">
                        <AlertCircle className="h-5 w-5 mr-2" />
                        {error}
                    </div>
                ) : summary ? (
                    <>
                        {/* 头部 */}
                        <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <BookOpen className="h-4 w-4" />
                                <span className="font-medium">{typeLabel[summary.type] || summary.type}</span>
                                <span className="text-xs">#{summary.id}</span>
                            </div>
                            <Link
                                href={`/questions/${summary.id}`}
                                target="_blank"
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                                查看原题
                                <ExternalLink className="h-3 w-3" />
                            </Link>
                        </div>

                        {/* 内容 */}
                        <div className="p-4">
                            <p className="text-foreground leading-relaxed">{summary.content}</p>

                            {/* 知识点标签 */}
                            {summary.tags.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {summary.tags.map((tag, idx) => (
                                        <span
                                            key={idx}
                                            className="inline-block px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : null}
            </div>
        </NodeViewWrapper>
    );
}

/**
 * Tiptap 自定义节点：题目引用
 */
export const QuestionEmbed = Node.create({
    name: 'questionEmbed',
    group: 'block',
    atom: true, // 不可分割的原子节点

    addAttributes() {
        return {
            questionId: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-question-id'),
                renderHTML: (attributes) => ({
                    'data-question-id': attributes.questionId,
                }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-question-embed]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes({ 'data-question-embed': '' }, HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(QuestionEmbedView);
    },
});
