"use client";

import React, { useState, useEffect } from "react";
import { Tag, Plus, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  getTagsAction,
  createTagAction,
  getNoteTagsAction,
  setNoteTagsAction,
} from "@/server/actions/note-tag";
import { type NoteTag } from "@/types";
import { toast } from "sonner";

interface TagSelectorProps {
  noteId: number;
  onTagsChange?: (tags: NoteTag[]) => void;
}

export function TagSelector({ noteId, onTagsChange }: TagSelectorProps) {
  const [allTags, setAllTags] = useState<NoteTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [isOpen, setIsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // 加载所有标签和当前笔记的标签
  useEffect(() => {
    const loadTags = async () => {
      const [allResult, noteResult] = await Promise.all([
        getTagsAction(),
        getNoteTagsAction(noteId),
      ]);

      if (allResult.success && allResult.tags) {
        const formattedTags = allResult.tags.map((t) => ({
          ...t,
          color: t.color ?? "",
        })) as NoteTag[];
        setAllTags(formattedTags);
      }
      if (noteResult.success && noteResult.tags) {
        const formattedTags = noteResult.tags.map((t) => ({
          ...t,
          color: t.color ?? "",
        })) as NoteTag[];
        setSelectedTagIds(new Set(formattedTags.map((t) => t.id)));
        onTagsChange?.(formattedTags);
      }
    };
    loadTags();
  }, [noteId, onTagsChange]);

  // 切换标签选中状态
  const toggleTag = async (tagId: number) => {
    const newSelected = new Set(selectedTagIds);
    if (newSelected.has(tagId)) {
      newSelected.delete(tagId);
    } else {
      newSelected.add(tagId);
    }

    setSelectedTagIds(newSelected);

    const result = await setNoteTagsAction(noteId, Array.from(newSelected));
    if (result.success) {
      const selectedTags = allTags.filter((t) => newSelected.has(t.id));
      onTagsChange?.(selectedTags);
    } else {
      toast.error(result.message || "设置标签失败");
      // 回滚
      setSelectedTagIds(selectedTagIds);
    }
  };

  // 创建新标签
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    setIsCreating(true);
    const result = await createTagAction(newTagName.trim());

    if (result.success && result.tagId) {
      // 刷新标签列表
      const tagsResult = await getTagsAction();
      if (tagsResult.success && tagsResult.tags) {
        const formattedTags = tagsResult.tags.map((t) => ({
          ...t,
          color: t.color ?? "",
        })) as NoteTag[];
        setAllTags(formattedTags);
      }
      setNewTagName("");
      toast.success("标签已创建");
    } else {
      toast.error(result.message || "创建失败");
    }
    setIsCreating(false);
  };

  const selectedTags = allTags.filter((t) => selectedTagIds.has(t.id));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 已选中的标签 */}
      {selectedTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="gap-1 pr-1"
          style={{
            backgroundColor: (tag.color ?? "") + "20",
            color: tag.color ?? "",
            borderColor: tag.color ?? "",
          }}
        >
          {tag.name}
          <button
            onClick={() => toggleTag(tag.id)}
            className="ml-1 rounded-full hover:bg-black/10 p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </Badge>
      ))}

      {/* 添加标签按钮 */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1 text-muted-foreground"
          >
            <Tag className="w-3 h-3" />
            <Plus className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          {/* 创建新标签 */}
          <div className="flex gap-1 mb-2">
            <Input
              placeholder="新建标签..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              className="h-8 px-2"
              onClick={handleCreateTag}
              disabled={isCreating || !newTagName.trim()}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* 标签列表 */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {allTags.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                暂无标签，创建一个吧
              </p>
            )}
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className="w-full flex items-center justify-between p-1.5 rounded hover:bg-muted text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color ?? "" }}
                  />
                  {tag.name}
                </span>
                {selectedTagIds.has(tag.id) && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
