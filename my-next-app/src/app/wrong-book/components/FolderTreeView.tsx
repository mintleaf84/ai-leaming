"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WrongQuestionsByTag } from "@/lib/services/wrong-question";
import type { QuestionFolder } from "@/lib/services/question-folder";
import { isImeComposing } from "@/lib/utils/ime";

interface FolderTreeViewProps {
  tagGroups: WrongQuestionsByTag[];
  folders: QuestionFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: () => void;
  onRenameFolder: (id: number, name: string) => void;
  onDeleteFolder: (id: number) => void;
  onStartPractice: (questionIds: number[]) => void;
}

// Virtual tag tree node
interface TagNode {
  name: string;
  fullPath: string;
  count: number;
  children: TagNode[];
}

function buildTagTree(groups: WrongQuestionsByTag[]): TagNode[] {
  const root: TagNode[] = [];
  for (const group of groups) {
    const parts = group.tag.split("/");
    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const fullPath = parts.slice(0, i + 1).join("/");
      let node = level.find((n) => n.name === name);
      if (!node) {
        node = { name, fullPath, count: 0, children: [] };
        level.push(node);
      }
      if (i === parts.length - 1) node.count += group.count;
      level = node.children;
    }
  }
  // propagate counts
  function propagate(nodes: TagNode[]): number {
    let total = 0;
    for (const n of nodes) {
      if (n.children.length > 0) {
        n.count = propagate(n.children);
      }
      total += n.count;
    }
    return total;
  }
  propagate(root);
  return root;
}

function TagTreeNode({
  node,
  level,
  selectedId,
  onSelect,
}: {
  node: TagNode;
  level: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(level === 0);
  const tagId = `tag:${node.fullPath}`;
  const isSelected = selectedId === tagId;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      {/* 整行 = 展开/收起 + 选中，本身就是按钮（真 <button>，键盘行为由浏览器给） */}
      <button
        type="button"
        className={`flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer transition-colors rounded-md mx-1 ${
          isSelected
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-muted/50 text-foreground"
        }`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
        onClick={() => {
          setExpanded(!expanded);
          onSelect(tagId);
        }}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">
          {node.count}
        </Badge>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map((c) => (
            <TagTreeNode
              key={c.fullPath}
              node={c}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTreeView({
  tagGroups,
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: FolderTreeViewProps) {
  const tagTree = useMemo(() => buildTagTree(tagGroups), [tagGroups]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const handleStartRename = (f: QuestionFolder) => {
    setEditingId(f.id);
    setEditName(f.name);
  };

  const handleConfirmRename = () => {
    if (editingId !== null && editName.trim()) {
      onRenameFolder(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden h-full">
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold text-foreground">文件夹</h3>
      </div>

      <div className="overflow-y-auto max-h-[calc(100dvh-300px)]">
        {/* Tag folders */}
        {tagTree.length > 0 && (
          <div className="py-2">
            <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              知识点
            </div>
            {tagTree.map((node) => (
              <TagTreeNode
                key={node.fullPath}
                node={node}
                level={0}
                selectedId={selectedFolderId}
                onSelect={onSelectFolder}
              />
            ))}
          </div>
        )}

        {/* Custom folders */}
        <div className="py-2 border-t">
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              自定义文件夹
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={onCreateFolder}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {folders.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              暂无文件夹
            </p>
          )}

          {folders.map((f) => {
            const folderId = `folder:${f.id}`;
            const isSelected = selectedFolderId === folderId;

            return (
              <div
                key={f.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-md mx-1 ${
                  isSelected
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted/50 text-foreground"
                }`}
              >
                {editingId === f.id ? (
                  <>
                    <div
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: f.color }}
                    />
                    {/* gap-3（12px）是必需的：p-1.5 -m-1.5 让每个 14px 图标的热区左右各外扩
                        6px，间距小于 12px 时相邻热区会重叠 → 点交错处会触发另一个按钮 */}
                    <div className="flex-1 flex items-center gap-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-1.5 py-0.5 text-sm border rounded bg-background"
                        autoFocus
                        onKeyDown={(e) => {
                          // 组合态 Enter 是确认候选词，不能当"确认重命名"
                          if (isImeComposing(e)) return;
                          if (e.key === "Enter") handleConfirmRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConfirmRename();
                        }}
                        aria-label="确认重命名"
                        className="p-1.5 -m-1.5 rounded hover:bg-accent/60"
                      >
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                        }}
                        aria-label="取消重命名"
                        className="p-1.5 -m-1.5 rounded hover:bg-accent/60"
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* 选中文件夹 = 这一行左边那块，本身就是按钮；更多操作菜单是它的
                        **兄弟**而不是子节点 —— 按钮里再套按钮，读屏器会念两个控件。
                        `-ml-3 pl-3 -my-2 py-2` 把热区撑回整行（与外层 px-3 py-2 对齐），
                        视觉位置不变。 */}
                    <button
                      type="button"
                      onClick={() => onSelectFolder(folderId)}
                      aria-current={isSelected ? "true" : undefined}
                      className="-my-2 -ml-3 flex flex-1 min-w-0 items-center gap-2 py-2 pl-3 text-left"
                    >
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: f.color }}
                      />
                      <span className="flex-1 truncate">{f.name}</span>
                    </button>
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 shrink-0"
                    >
                      {f.questionCount}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="shrink-0 p-1.5 -m-1.5 rounded hover:bg-accent/60 text-muted-foreground hover:text-foreground"
                          aria-label="文件夹更多操作"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleStartRename(f)}>
                          <Pencil className="w-3.5 h-3.5 mr-2" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => onDeleteFolder(f.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
