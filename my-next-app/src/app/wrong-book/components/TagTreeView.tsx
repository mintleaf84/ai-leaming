'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type WrongQuestionsByTag, type WrongQuestionItem } from '@/lib/services/wrong-question';
import { QuestionCountPicker } from './QuestionCountPicker';

interface TagTreeNode {
    name: string;          // 当前节点名称
    fullPath: string;      // 完整路径
    count: number;         // 该节点下的题目总数
    questions: WrongQuestionItem[];  // 该节点直接关联的题目
    children: TagTreeNode[];  // 子节点
}

interface TagTreeViewProps {
    groupedQuestions: WrongQuestionsByTag[];
    onStartPractice: (questionIds: number[], limit?: number) => void;
}

/**
 * 构建知识点树形结构
 */
function buildTagTree(groups: WrongQuestionsByTag[]): TagTreeNode[] {
    const root: TagTreeNode[] = [];

    for (const group of groups) {
        const parts = group.tag.split('/');
        let currentLevel = root;

        for (let i = 0; i < parts.length; i++) {
            const name = parts[i];
            const fullPath = parts.slice(0, i + 1).join('/');
            const isLeaf = i === parts.length - 1;

            let existingNode = currentLevel.find(n => n.name === name);

            if (!existingNode) {
                existingNode = {
                    name,
                    fullPath,
                    count: 0,
                    questions: [],
                    children: []
                };
                currentLevel.push(existingNode);
            }

            // 只有叶子节点才累加题目数量，避免重复计数
            if (isLeaf) {
                existingNode.count += group.count;
                existingNode.questions = group.questions;
            }

            currentLevel = existingNode.children;
        }
    }

    // 向下传播叶子节点的计数到父节点
    function propagateCounts(node: TagTreeNode): number {
        if (node.children.length === 0) {
            return node.count;
        }
        let childrenCount = 0;
        for (const child of node.children) {
            childrenCount += propagateCounts(child);
        }
        // 父节点的计数等于所有子节点计数之和
        node.count = childrenCount;
        return childrenCount;
    }

    for (const node of root) {
        propagateCounts(node);
    }

    return root;
}

/**
 * 从树节点收集所有题目 ID
 */
function collectQuestionIds(node: TagTreeNode): number[] {
    const ids = node.questions.map(q => q.questionId);
    for (const child of node.children) {
        ids.push(...collectQuestionIds(child));
    }
    return ids;
}

interface TreeNodeProps {
    node: TagTreeNode;
    level: number;
    onStartPractice: (questionIds: number[], limit?: number) => void;
}

function TreeNode({ node, level, onStartPractice }: TreeNodeProps) {
    const [isExpanded, setIsExpanded] = useState(level === 0);
    const hasChildren = node.children.length > 0;
    const hasQuestions = node.questions.length > 0;

    const allQuestionIds = useMemo(() => collectQuestionIds(node), [node]);

    return (
        <div>
            {/* 节点行 */}
            <div
                className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
                style={{ paddingLeft: `${12 + level * 20}px` }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    {/* 展开/收起图标 */}
                    {hasChildren ? (
                        isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )
                    ) : (
                        <span className="w-4" /> // 占位
                    )}

                    {/* 节点名称 */}
                    <span className="text-sm font-medium">{node.name}</span>

                    {/* 题目数量 */}
                    <Badge variant="secondary" className="text-xs">
                        {node.count} 题
                    </Badge>
                </div>

                {/* 练习按钮 - 带题量选择 */}
                <QuestionCountPicker
                    totalCount={allQuestionIds.length}
                    onConfirm={(count) => onStartPractice(allQuestionIds, count)}
                >
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Play className="w-4 h-4" />
                    </Button>
                </QuestionCountPicker>
            </div>

            {/* 子节点 */}
            {isExpanded && hasChildren && (
                <div className="border-l border-muted ml-6">
                    {node.children.map(child => (
                        <TreeNode
                            key={child.fullPath}
                            node={child}
                            level={level + 1}
                            onStartPractice={onStartPractice}
                        />
                    ))}
                </div>
            )}

            {/* 叶子节点的题目列表 */}
            {isExpanded && hasQuestions && !hasChildren && (
                <div className="ml-10 space-y-1 py-2">
                    {node.questions.map(q => (
                        <div
                            key={q.questionId}
                            className="text-sm text-muted-foreground p-2 hover:bg-muted rounded-lg cursor-pointer line-clamp-2"
                        >
                            {q.questionContent}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * 知识点树形视图组件
 */
export function TagTreeView({ groupedQuestions, onStartPractice }: TagTreeViewProps) {
    const tree = useMemo(() => buildTagTree(groupedQuestions), [groupedQuestions]);

    if (tree.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-8">
                暂无知识点数据
            </div>
        );
    }

    return (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            {tree.map(node => (
                <TreeNode
                    key={node.fullPath}
                    node={node}
                    level={0}
                    onStartPractice={onStartPractice}
                />
            ))}
        </div>
    );
}
