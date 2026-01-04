'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronDown, Check, Folder, FolderOpen, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

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

// 递归组件：渲染单个节点
function TreeNode({
    node,
    level,
    selectedTags,
    expandedIds,
    onToggleExpand,
    onToggleSelect,
    searchTerm
}: {
    node: KeypointNode;
    level: number;
    selectedTags: string[];
    expandedIds: Set<number>;
    onToggleExpand: (id: number) => void;
    onToggleSelect: (name: string, node: KeypointNode) => void;
    searchTerm: string;
}) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedTags.includes(node.name);

    // 检查是否有匹配搜索的子节点
    const matchesSearch = searchTerm === '' || node.name.toLowerCase().includes(searchTerm.toLowerCase());
    const hasMatchingDescendant = useMemo(() => {
        if (searchTerm === '') return true;
        const checkDescendants = (n: KeypointNode): boolean => {
            if (n.name.toLowerCase().includes(searchTerm.toLowerCase())) return true;
            if (n.children) {
                return n.children.some(child => checkDescendants(child));
            }
            return false;
        };
        return checkDescendants(node);
    }, [node, searchTerm]);

    // 如果不匹配搜索且没有匹配的子节点，不渲染
    if (searchTerm !== '' && !matchesSearch && !hasMatchingDescendant) {
        return null;
    }

    // 计算选中的子节点数量
    const selectedChildCount = useMemo(() => {
        const countSelected = (n: KeypointNode): number => {
            let count = selectedTags.includes(n.name) ? 1 : 0;
            if (n.children) {
                count += n.children.reduce((acc, child) => acc + countSelected(child), 0);
            }
            return count;
        };
        return hasChildren ? node.children!.reduce((acc, child) => acc + countSelected(child), 0) : 0;
    }, [node, selectedTags, hasChildren]);

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
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export function KeypointTree({ selectedTags, onSelectionChange, maxHeight = "400px" }: KeypointTreeProps) {
    const [keypointData, setKeypointData] = useState<KeypointNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    // 加载知识点数据
    useEffect(() => {
        fetch('/data/keypoints.json')
            .then(res => res.json())
            .then((data: KeypointNode[]) => {
                setKeypointData(data);
                // 默认展开第一层
                const firstLevelIds = new Set(data.map(node => node.id));
                setExpandedIds(firstLevelIds);
                setLoading(false);
            })
            .catch(err => {
                console.error('加载知识点数据失败', err);
                setLoading(false);
            });
    }, []);

    const handleToggleExpand = (id: number) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleToggleSelect = (name: string, node: KeypointNode) => {
        const newSelection = selectedTags.includes(name)
            ? selectedTags.filter(t => t !== name)
            : [...selectedTags, name];
        onSelectionChange(newSelection);
    };

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
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
