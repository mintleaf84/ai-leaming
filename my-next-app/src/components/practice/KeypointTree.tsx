'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ChevronDown, Check, Folder, FolderOpen, FileText } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { fetchJson } from '@/lib/utils/api-client';

// 知识点节点类型
export interface KeypointNode {
    id: number;
    name: string;
    count: number;
    children: KeypointNode[] | null;
}

interface KeypointTreeProps {
    selectedTags: string[];
    onSelectionChange: (tags: string[]) => void;
    maxHeight?: string;
}

// 预计算的节点树属性字典
interface TreePropsMap {
    selectedCounts: Map<number, number>;
    matchingNodes: Set<number>;
}

// 递归组件：渲染单个节点
const TreeNode = React.memo(function TreeNode({
    node,
    level,
    selectedTags,
    expandedIds,
    onToggleExpand,
    onToggleSelect,
    searchTerm,
    treePropsMap
}: {
    node: KeypointNode;
    level: number;
    selectedTags: string[];
    expandedIds: Set<number>;
    onToggleExpand: (id: number) => void;
    onToggleSelect: (name: string, node: KeypointNode) => void;
    searchTerm: string;
    treePropsMap: TreePropsMap;
}) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedTags.includes(node.name);

    // 从 O(N) 的顶层映射表中直接读取该节点状态，消灭 O(N^2) 瓶颈
    const isVisible = treePropsMap.matchingNodes.has(node.id);
    if (!isVisible && searchTerm !== '') return null;

    // self 选中状态不包含在 descendants 中展现
    const nodeTotalSelected = treePropsMap.selectedCounts.get(node.id) || 0;
    const selectedChildCount = nodeTotalSelected - (isSelected ? 1 : 0);

    return (
        <div className="select-none">
            <div
                className={cn(
                    "flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer transition-colors",
                    "hover:bg-accent/50",
                    isSelected && "bg-primary/10"
                )}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
            >
                {/* 展开/折叠按钮 */}
                {hasChildren ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(node.id);
                        }}
                        className="p-0.5 hover:bg-accent rounded"
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                    </button>
                ) : (
                    <span className="w-5" />
                )}

                {/* 图标 */}
                {hasChildren ? (
                    isExpanded ? (
                        <FolderOpen className="h-4 w-4 text-amber-500" />
                    ) : (
                        <Folder className="h-4 w-4 text-amber-500" />
                    )
                ) : (
                    <FileText className="h-4 w-4 text-blue-500" />
                )}

                {/* 复选框 */}
                <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(node.name, node)}
                    className="ml-1"
                />

                {/* 名称 */}
                <span
                    className={cn(
                        "flex-1 text-sm truncate",
                        isSelected && "font-medium text-primary"
                    )}
                    onClick={() => onToggleSelect(node.name, node)}
                >
                    {node.name}
                </span>

                {/* 题目数量 */}
                <span className="text-xs text-muted-foreground">
                    {node.count}题
                </span>

                {/* 已选子节点数量 */}
                {hasChildren && selectedChildCount > 0 && (
                    <Badge variant="secondary" className="text-xs h-5">
                        {selectedChildCount}选中
                    </Badge>
                )}
            </div>

            {/* 子节点 */}
            {hasChildren && isExpanded && (
                <div>
                    {node.children!.map((child) => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            level={level + 1}
                            selectedTags={selectedTags}
                            expandedIds={expandedIds}
                            onToggleExpand={onToggleExpand}
                            onToggleSelect={onToggleSelect}
                            searchTerm={searchTerm}
                            treePropsMap={treePropsMap}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

export function KeypointTree({ selectedTags, onSelectionChange, maxHeight = "400px" }: KeypointTreeProps) {
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    // 使用 useQuery 加载静态知识点数据，staleTime: Infinity 保证应用生命周期内只请求一次
    const { data: keypointData = [], isLoading: loading } = useQuery({
        queryKey: ['keypoints-tree'],
        queryFn: () => fetchJson<KeypointNode[]>('/data/keypoints.json'),
        staleTime: Infinity,
    });

    // 数据加载完成后默认展开第一层
    useEffect(() => {
        if (keypointData.length > 0 && expandedIds.size === 0) {
            setExpandedIds(new Set(keypointData.map(node => node.id)));
        }
    }, [keypointData, expandedIds.size]);

    // O(N) 一次性计算整棵树的所有节点可见性和选中数量字典
    const treePropsMap = useMemo(() => {
        const selectedCounts = new Map<number, number>();
        const matchingNodes = new Set<number>();
        const lowerSearch = searchTerm.toLowerCase();

        const traverse = (n: KeypointNode): { sel: number, match: boolean } => {
            let sel = selectedTags.includes(n.name) ? 1 : 0;
            let match = lowerSearch === '' || n.name.toLowerCase().includes(lowerSearch);

            if (n.children) {
                for (const child of n.children) {
                    const res = traverse(child);
                    sel += res.sel;
                    match = match || res.match;
                }
            }

            selectedCounts.set(n.id, sel);
            if (match) matchingNodes.add(n.id);
            return { sel, match };
        };

        keypointData.forEach(traverse);
        return { selectedCounts, matchingNodes };
    }, [keypointData, selectedTags, searchTerm]);

    const handleToggleExpand = useCallback((id: number) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const handleToggleSelect = useCallback((name: string, node: KeypointNode) => {
        onSelectionChange(
            selectedTags.includes(name)
                ? selectedTags.filter(t => t !== name)
                : [...selectedTags, name]
        );
    }, [selectedTags, onSelectionChange]);

    // 全选/取消该分类下所有叶子节点
    const selectAllLeaves = (node: KeypointNode) => {
        const leaves: string[] = [];
        const collectLeaves = (n: KeypointNode) => {
            if (!n.children || n.children.length === 0) {
                leaves.push(n.name);
            } else {
                n.children.forEach(collectLeaves);
            }
        };
        collectLeaves(node);

        const allSelected = leaves.every(l => selectedTags.includes(l));
        if (allSelected) {
            // 取消选择
            onSelectionChange(selectedTags.filter(t => !leaves.includes(t)));
        } else {
            // 全选
            const newSelection = [...new Set([...selectedTags, ...leaves])];
            onSelectionChange(newSelection);
        }
    };

    const expandAll = () => {
        const allIds = new Set<number>();
        const collectIds = (nodes: KeypointNode[]) => {
            nodes.forEach(node => {
                allIds.add(node.id);
                if (node.children) collectIds(node.children);
            });
        };
        collectIds(keypointData);
        setExpandedIds(allIds);
    };

    const collapseAll = () => {
        setExpandedIds(new Set());
    };

    const clearSelection = () => {
        onSelectionChange([]);
    };

    if (loading) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                加载知识点结构...
            </div>
        );
    }

    return (
        <div className="border rounded-lg">
            {/* 工具栏 */}
            <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
                <Input
                    placeholder="搜索知识点..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 flex-1"
                />
                <Button variant="ghost" size="sm" onClick={expandAll}>
                    展开全部
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll}>
                    折叠全部
                </Button>
                {selectedTags.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearSelection} className="text-destructive">
                        清空 ({selectedTags.length})
                    </Button>
                )}
            </div>

            {/* 已选知识点预览 */}
            {selectedTags.length > 0 && (
                <div className="p-2 border-b bg-primary/5 flex flex-wrap gap-1">
                    {selectedTags.slice(0, 5).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                            <button
                                onClick={() => onSelectionChange(selectedTags.filter(t => t !== tag))}
                                className="ml-1 hover:text-destructive"
                            >
                                ×
                            </button>
                        </Badge>
                    ))}
                    {selectedTags.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                            +{selectedTags.length - 5} 更多
                        </Badge>
                    )}
                </div>
            )}

            {/* 树形结构 */}
            <ScrollArea style={{ maxHeight }}>
                <div className="p-2">
                    {keypointData.map((node) => (
                        <TreeNode
                            key={node.id}
                            node={node}
                            level={0}
                            selectedTags={selectedTags}
                            expandedIds={expandedIds}
                            onToggleExpand={handleToggleExpand}
                            onToggleSelect={handleToggleSelect}
                            searchTerm={searchTerm}
                            treePropsMap={treePropsMap}
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
