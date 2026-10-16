"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type FeedbackType =
  "wrong_answer" | "wrong_content" | "wrong_explanation" | "other";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feedbackType: FeedbackType;
  setFeedbackType: (type: FeedbackType) => void;
  feedbackDescription: string;
  setFeedbackDescription: (desc: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
}

const feedbackTypeOptions = [
  { value: "wrong_answer" as const, label: "答案错误" },
  { value: "wrong_content" as const, label: "题干错误" },
  { value: "wrong_explanation" as const, label: "解析错误" },
  { value: "other" as const, label: "其他问题" },
];

export function FeedbackDialog({
  open,
  onOpenChange,
  feedbackType,
  setFeedbackType,
  feedbackDescription,
  setFeedbackDescription,
  isSubmitting,
  onSubmit,
}: FeedbackDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>题目纠错</DialogTitle>
          <DialogDescription>
            请描述你发现的问题，帮助我们改进题库质量
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            {feedbackTypeOptions.map((option) => (
              <Button
                key={option.value}
                variant={feedbackType === option.value ? "default" : "outline"}
                onClick={() => setFeedbackType(option.value)}
                className="w-full"
              >
                {option.label}
              </Button>
            ))}
          </div>
          <textarea
            placeholder="详细描述你发现的问题（选填）"
            value={feedbackDescription}
            onChange={(e) => setFeedbackDescription(e.target.value)}
            className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              "提交反馈"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
