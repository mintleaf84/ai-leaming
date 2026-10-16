"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { createManualWrongQuestionAction } from "@/server/actions/wrong-questions";

interface AddQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * 获取选项对应的索引标识 (A, B, C, ...)
 */
function getOptionIndex(index: number): string {
  return String.fromCharCode(65 + index);
}

export function AddQuestionDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddQuestionDialogProps) {
  const [formData, setFormData] = useState({
    content: "",
    optionsStr: "",
    answer: "",
    explanation: "",
    tagsStr: "",
    dimension: "knowledge",
    type: "single",
  });
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setFormData({
      content: "",
      optionsStr: "",
      answer: "",
      explanation: "",
      tagsStr: "",
      dimension: "knowledge",
      type: "single",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isTrueFalse = formData.type === "truefalse";
      const isFillBlank = formData.type === "fill_blank";
      // 判断题选项固定为 ["正确", "错误"]
      const options = isTrueFalse
        ? ["正确", "错误"]
        : isFillBlank
          ? []
          : formData.optionsStr
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
      const tags = formData.tagsStr
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (!formData.content) throw new Error("题干不能为空");
      if (!isTrueFalse && !isFillBlank && options.length < 2)
        throw new Error("至少需要2个选项");
      if (!formData.answer) throw new Error("答案不能为空");
      if (tags.length === 0) throw new Error("至少需要1个标签");

      // 校验答案并转换为索引格式 (A, B, C, ...)
      let answerForSave: string;
      if (formData.type === "truefalse") {
        if (formData.answer !== "A" && formData.answer !== "B")
          throw new Error("判断题答案必须为 A（正确）或 B（错误）");
        answerForSave = formData.answer;
      } else if (formData.type === "fill_blank") {
        // 填空题：直接保存文本答案，支持 | 分隔的多答案
        answerForSave = formData.answer.trim();
      } else if (formData.type === "single") {
        const optIndex = options.indexOf(formData.answer);
        if (optIndex === -1) throw new Error("单选题答案必须是选项之一");
        answerForSave = getOptionIndex(optIndex);
      } else {
        try {
          const ansArr = JSON.parse(formData.answer);
          if (!Array.isArray(ansArr) || ansArr.length === 0)
            throw new Error("多选题至少选择一个答案");
          const invalid = ansArr.filter((a: string) => !options.includes(a));
          if (invalid.length > 0)
            throw new Error("多选题答案项必须存在于选项中");
          // 转换为索引格式
          const indices = ansArr.map((a: string) =>
            getOptionIndex(options.indexOf(a)),
          );
          answerForSave = JSON.stringify(indices);
        } catch (_e) {
          throw new Error("多选题答案格式错误");
        }
      }

      const questionData = {
        content: formData.content,
        options,
        answer: answerForSave,
        explanation: formData.explanation || "暂无解析内容",
        tags,
        dimension: formData.dimension as
          "knowledge" | "understanding" | "application",
        type: formData.type as "single" | "multi" | "truefalse" | "fill_blank",
      };

      const result = await createManualWrongQuestionAction(questionData);

      if (result.serverError) {
        toast.error(result.serverError || "添加失败");
      } else if (result.data) {
        toast.success("题目添加成功");
        resetForm();
        onSuccess();
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "添加失败");
    } finally {
      setLoading(false);
    }
  };

  // 实时解析选项以供选择
  const parsedOptions = formData.optionsStr
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // 处理多选变动
  const handleMultiAnswerChange = (option: string, checked: boolean) => {
    try {
      const current = formData.answer ? JSON.parse(formData.answer) : [];
      let next;
      if (checked) {
        next = [...current, option];
      } else {
        next = current.filter((o: string) => o !== option);
      }
      setFormData((prev) => ({ ...prev, answer: JSON.stringify(next) }));
    } catch {
      // 如果解析失败，重置
      setFormData((prev) => ({ ...prev, answer: JSON.stringify([option]) }));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) resetForm();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>手动录入题目</DialogTitle>
          <DialogDescription>
            添加一道新题目到题库。请确保数据的准确性。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">题干内容</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, content: e.target.value }))
              }
              rows={3}
              placeholder="请输入题目内容..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>题目类型</Label>
              <Select
                value={formData.type}
                onValueChange={(val) => {
                  const newType = val as
                    "single" | "multi" | "truefalse" | "fill_blank";
                  const oldType = formData.type;

                  let newOptionsStr = formData.optionsStr;
                  if (newType === "truefalse") {
                    newOptionsStr = "正确\n错误";
                  } else if (newType === "fill_blank") {
                    newOptionsStr = "";
                  } else if (newType !== oldType && oldType === "truefalse") {
                    newOptionsStr = "";
                  }

                  setFormData((prev) => ({
                    ...prev,
                    type: newType,
                    optionsStr: newOptionsStr,
                    answer: "",
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">单项选择</SelectItem>
                  <SelectItem value="multi">不定项选择 (多选)</SelectItem>
                  <SelectItem value="truefalse">判断题</SelectItem>
                  <SelectItem value="fill_blank">填空题</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dimension">维度</Label>
              <Select
                value={formData.dimension}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, dimension: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="knowledge">识记</SelectItem>
                  <SelectItem value="understanding">理解</SelectItem>
                  <SelectItem value="application">应用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 判断题时隐藏选项编辑区，显示固定提示 */}
          {formData.type === "truefalse" ? (
            <div className="space-y-2">
              <Label>选项 (判断题固定)</Label>
              <div className="p-3 rounded-md border bg-muted/30 text-sm text-muted-foreground">
                A. 正确 &nbsp;/&nbsp; B. 错误（系统自动填充，无需手动修改）
              </div>
            </div>
          ) : formData.type === "fill_blank" ? (
            <div className="space-y-2">
              <Label>选项 (填空题无需选项)</Label>
              <div className="p-3 rounded-md border bg-muted/30 text-sm text-muted-foreground">
                填空题无需设置选项，直接在题干中用 _____ 标记空位。
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="options">选项列表 (每行一个)</Label>
              <Textarea
                id="options"
                value={formData.optionsStr}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    optionsStr: e.target.value,
                  }))
                }
                rows={4}
                placeholder="选项A&#10;选项B&#10;选项C&#10;选项D"
                required
                className="font-mono text-sm"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-primary font-bold">
              正确答案 (
              {formData.type === "single"
                ? "单选"
                : formData.type === "truefalse"
                  ? "判断"
                  : formData.type === "fill_blank"
                    ? "填空"
                    : "多选"}
              )
            </Label>

            {formData.type === "truefalse" ? (
              /* 判断题：只允许选 A（正确）或 B（错误） */
              <Select
                value={formData.answer}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, answer: val }))
                }
              >
                <SelectTrigger className="border-primary/50">
                  <SelectValue placeholder="选择正确答案" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — 正确</SelectItem>
                  <SelectItem value="B">B — 错误</SelectItem>
                </SelectContent>
              </Select>
            ) : formData.type === "fill_blank" ? (
              /* 填空题：支持多个空，每个空支持多个答案用 | 分隔 */
              <div className="space-y-3">
                <div className="p-3 rounded-md border bg-teal-500/5 border-teal-500/20 text-sm">
                  <p className="font-medium text-teal-700 dark:text-teal-400 mb-1">
                    填空题答案格式说明
                  </p>
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    <li>
                      - 多个空之间用中文分号{" "}
                      <code className="bg-muted px-1 rounded">；</code> 分隔
                    </li>
                    <li>
                      - 单个空有多个可接受答案时，用{" "}
                      <code className="bg-muted px-1 rounded">|</code> 分隔
                    </li>
                    <li>
                      - 示例：
                      <code className="bg-muted px-1 rounded">
                        教育学|教育学原理；赫尔巴特|赫尔巴特
                      </code>
                    </li>
                  </ul>
                </div>
                <Textarea
                  value={formData.answer}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, answer: e.target.value }))
                  }
                  placeholder="答案1A|答案1B；答案2"
                  rows={3}
                  className="font-mono text-sm"
                  required
                />
              </div>
            ) : formData.type === "single" ? (
              <Select
                value={formData.answer}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, answer: val }))
                }
              >
                <SelectTrigger className="border-primary/50">
                  <SelectValue placeholder="选择正确选项" />
                </SelectTrigger>
                <SelectContent>
                  {parsedOptions.length > 0 ? (
                    parsedOptions.map((opt, idx) => (
                      <SelectItem key={idx} value={opt}>
                        {opt}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground">
                      请先填写选项
                    </div>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-primary/20 p-3 rounded-md bg-muted/10">
                {parsedOptions.length > 0 ? (
                  parsedOptions.map((opt, idx) => {
                    let isChecked = false;
                    try {
                      isChecked = JSON.parse(formData.answer || "[]").includes(
                        opt,
                      );
                    } catch {}

                    return (
                      <div key={idx} className="flex items-center space-x-2">
                        <Checkbox
                          id={`add-ans-${idx}`}
                          checked={isChecked}
                          onCheckedChange={(c) =>
                            handleMultiAnswerChange(opt, c === true)
                          }
                        />
                        <Label
                          htmlFor={`add-ans-${idx}`}
                          className="font-normal cursor-pointer flex-1 truncate"
                          title={opt}
                        >
                          {opt}
                        </Label>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-2 text-xs text-muted-foreground">
                    请先填写选项
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="explanation">解析</Label>
            <Textarea
              id="explanation"
              value={formData.explanation}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  explanation: e.target.value,
                }))
              }
              rows={3}
              placeholder="请输入题目解析..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">标签 (逗号分隔)</Label>
            <Input
              id="tags"
              value={formData.tagsStr}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, tagsStr: e.target.value }))
              }
              placeholder="心理学, 认知过程, 注意"
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "添加中..." : "添加题目"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
