"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FolderPlus, Plus, Check, Loader2 } from "lucide-react";
import type { QuestionFolder } from "@/lib/services/question-folder";

const FOLDER_COLORS = [
  "#6b7280",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

interface AddToFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  folders: QuestionFolder[];
  selectedCount: number;
  isSubmitting: boolean;
  onAddToFolder: (folderId: number) => void;
  onCreateFolder: (name: string, color: string) => void;
}

export function AddToFolderDialog({
  isOpen,
  onClose,
  folders,
  selectedCount,
  isSubmitting,
  onAddToFolder,
  onCreateFolder,
}: AddToFolderDialogProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateFolder(newName.trim(), newColor);
    setNewName("");
    setIsCreating(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-blue-500" />
            添加到文件夹
          </DialogTitle>
          <DialogDescription>
            将选中的 {selectedCount} 道题添加到文件夹
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-60 overflow-y-auto">
          {folders.length === 0 && !isCreating && (
            <p className="text-sm text-muted-foreground text-center py-4">
              还没有文件夹，创建一个吧
            </p>
          )}

          {folders.map((f) => (
            <button
              key={f.id}
              className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
              onClick={() => onAddToFolder(f.id)}
              disabled={isSubmitting}
            >
              <div
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: f.color }}
              />
              <span className="flex-1 text-sm font-medium">{f.name}</span>
              <span className="text-xs text-muted-foreground">
                {f.questionCount} 题
              </span>
            </button>
          ))}

          {isCreating ? (
            <div className="p-3 rounded-lg border space-y-3">
              <input
                type="text"
                placeholder="文件夹名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
              <div className="flex items-center gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setIsCreating(false);
                    setNewName("");
                  }}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                >
                  创建
                </Button>
              </div>
            </div>
          ) : (
            <button
              className="w-full flex items-center gap-2 p-3 rounded-lg border border-dashed hover:bg-accent/50 transition-colors text-sm text-muted-foreground"
              onClick={() => setIsCreating(true)}
            >
              <Plus className="w-4 h-4" />
              新建文件夹
            </button>
          )}
        </div>

        {isSubmitting && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            添加中...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
