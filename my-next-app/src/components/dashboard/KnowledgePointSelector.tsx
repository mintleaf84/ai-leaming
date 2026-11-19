"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getKnowledgeTreeAction } from "@/server/actions/practice";
import type { KnowledgeNode } from "@/lib/services/knowledge-tree";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Target,
  Loader2,
  ChevronRight,
  ChevronDown,
  Check,
  Folder,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ui/error-state";

// 递归树节点组件
function TreeNode({
  node,
  level = 0,
  selectedTags,
  toggleTag,
}: {
  node: KnowledgeNode;
  level?: number;
  selectedTags: string[];
  toggleTag: (tag: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedTags.includes(node.path);

  // 如果是叶子节点，默认总是展开（没子节点也不用展开）
  // 如果是父节点，点击可以折叠/展开
  //
  // 行本身不再挂 onClick：整行的点击此前只是「点展开箭头」或「点复选框」的便捷路径，
  // 现在把三件事分别落到三个真控件上（展开箭头 / 复选框 / 名称按钮），
  // 键盘 Tab 可达、Enter/Space 即原生激活，避免给容器加 role="button" 后
  // 与内层控件形成嵌套按钮。

  const handleRowActivate = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    } else {
      toggleTag(node.path);
    }
  };

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors cursor-pointer text-sm",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-accent text-foreground",
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {/* 展开/折叠按钮 (仅对有子节点的节点显示) */}
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "收起" : "展开"}${node.name}`}
            className="w-4 h-4 shrink-0 flex items-center justify-center rounded-sm hover:bg-black/5 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0" aria-hidden="true" />
        )}

        {/* 复选框/选择逻辑 */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={node.name}
          className={cn(
            "w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-all",
            isSelected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-border bg-card hover:border-primary/50",
          )}
          onClick={() => toggleTag(node.path)}
        >
          {isSelected && <Check className="w-3 h-3" />}
        </button>

        {/* 图标与文本：父节点点击收起/展开，叶子节点点击选中 */}
        <button
          type="button"
          className="flex items-center gap-2 flex-1 text-left"
          onClick={handleRowActivate}
        >
          {hasChildren ? (
            <Folder
              className={cn(
                "w-4 h-4 shrink-0",
                isSelected ? "text-primary" : "text-amber-400",
              )}
            />
          ) : (
            <FileText
              className={cn(
                "w-4 h-4 shrink-0",
                isSelected ? "text-primary" : "text-muted-foreground",
              )}
            />
          )}
          <span className={cn("font-medium", isSelected && "text-primary")}>
            {node.name}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {node.count}题
          </span>
        </button>
      </div>

      {hasChildren && expanded && (
        <div className="border-l border-border ml-5 my-1">
          {node.children.map((child: KnowledgeNode) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              selectedTags={selectedTags}
              toggleTag={toggleTag}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function KnowledgePointSelector({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [treeData, setTreeData] = useState<KnowledgeNode[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // 拉取失败要显式呈现：否则对话框里只剩"暂无知识点数据，请先导入教材"，
  // 用户会去翻教材，而不是重试。
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getKnowledgeTreeAction();
      if (result?.serverError) throw new Error(result.serverError);
      setTreeData(result.data?.tree || []);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error && error.message
          ? error.message
          : "获取知识点失败",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && treeData.length === 0 && !loadError) {
      // loadTree 首行就 setLoading(true)：这是"打开对话框才拉数据"的必要副作用，
      // 与 React 建议的"渲染期派生"不同（数据来自网络）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadTree();
    }
  }, [open, treeData.length, loadError, loadTree]);

  const toggleTag = (path: string) => {
    setSelectedTags((prev) =>
      prev.includes(path) ? prev.filter((t) => t !== path) : [...prev, path],
    );
  };

  const handleStart = () => {
    if (selectedTags.length === 0) {
      toast.warning("请至少选择一个知识点");
      return;
    }
    setOpen(false);
    const params = new URLSearchParams({
      mode: "focus",
      limit: "25",
      tags: selectedTags.join(","),
    });
    router.push(`/practice?${params.toString()}`);
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-white/95 backdrop-blur-xl border-white/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-xl">
            <Target className="w-5 h-5 text-emerald-600" />
            选择专项突破知识点
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : loadError ? (
            <ErrorState
              title="知识点加载失败"
              description={loadError}
              onRetry={() => void loadTree()}
              className="py-10"
            />
          ) : (
            <ScrollArea className="h-[400px] w-full rounded-xl border border-border bg-muted/30 p-2">
              {treeData.length > 0 ? (
                <div className="space-y-1">
                  {treeData.map((node) => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      selectedTags={selectedTags}
                      toggleTag={toggleTag}
                    />
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 py-10">
                  <Folder className="w-10 h-10 opacity-20" />
                  <span>暂无知识点数据，请先导入教材</span>
                </div>
              )}
            </ScrollArea>
          )}
        </div>

        <div className="flex justify-between items-center pt-2">
          <div className="text-xs text-muted-foreground">
            已选{" "}
            <span className="font-bold text-primary">
              {selectedTags.length}
            </span>{" "}
            个考点
          </div>
          <Button
            onClick={handleStart}
            disabled={selectedTags.length === 0}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-full px-6"
          >
            开始练习
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
