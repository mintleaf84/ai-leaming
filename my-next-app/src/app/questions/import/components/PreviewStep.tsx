"use client";

import React, { useState } from "react";
import {
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/utils";
import type { ParsedPdfQuestion } from "@/types/pdf-import";
import type { QuestionFolder } from "@/lib/services/question-folder";

interface PreviewStepProps {
  questions: ParsedPdfQuestion[];
  warnings: string[];
  folders: QuestionFolder[];
  onConfirm: (
    questions: ParsedPdfQuestion[],
    folderId?: number,
    addToWrongBook?: boolean,
  ) => void;
  onBack: () => void;
  isImporting: boolean;
  isParsing: boolean;
  parseProgress: number;
  totalChunks: number;
}

function QuestionCard({
  index,
  question,
  onUpdate,
}: {
  index: number;
  question: ParsedPdfQuestion;
  onUpdate: (q: ParsedPdfQuestion) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question);

  const confidenceColor =
    question.confidence >= 70
      ? "text-green-600 bg-green-50"
      : question.confidence >= 40
        ? "text-yellow-600 bg-yellow-50"
        : "text-red-600 bg-red-50";

  const saveEdit = () => {
    setEditing(false);
    onUpdate(draft);
  };

  return (
    <Card
      className={cn(
        "transition-all",
        question.confidence < 40 && "border-yellow-300",
      )}
    >
      <CardHeader
        className="cursor-pointer py-3 px-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs shrink-0">
                {index + 1}.{" "}
                {question.type === "multi"
                  ? "多选"
                  : question.type === "truefalse"
                    ? "判断"
                    : "单选"}
              </Badge>
              <Badge className={cn("text-xs shrink-0", confidenceColor)}>
                置信度 {question.confidence}%
              </Badge>
              {question.tags.length > 0 && (
                <span className="text-xs text-muted-foreground truncate">
                  {question.tags.join(", ")}
                </span>
              )}
            </div>
            <p className="text-sm line-clamp-2">{question.content}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {question.confidence < 50 && (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4 space-y-3">
          {editing ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">题干</label>
                <Textarea
                  value={draft.content}
                  onChange={(e) =>
                    setDraft({ ...draft, content: e.target.value })
                  }
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  选项（每行一个）
                </label>
                <Textarea
                  value={draft.options.join("\n")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">答案</label>
                  <Input
                    value={draft.answer}
                    onChange={(e) =>
                      setDraft({ ...draft, answer: e.target.value })
                    }
                    placeholder="A 或 A,C"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">题型</label>
                  <Select
                    value={draft.type}
                    onValueChange={(v) =>
                      setDraft({
                        ...draft,
                        type: v as "single" | "multi" | "truefalse",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">单选</SelectItem>
                      <SelectItem value="multi">多选</SelectItem>
                      <SelectItem value="truefalse">判断</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">解析</label>
                <Textarea
                  value={draft.explanation}
                  onChange={(e) =>
                    setDraft({ ...draft, explanation: e.target.value })
                  }
                  rows={2}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setDraft(question);
                  }}
                >
                  取消
                </Button>
                <Button size="sm" onClick={saveEdit}>
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                {question.options.map((opt, i) => {
                  const letter = String.fromCharCode(65 + i);
                  const isAnswer = question.answer.includes(letter);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "text-sm px-2 py-1 rounded",
                        isAnswer
                          ? "bg-green-50 text-green-700 font-medium"
                          : "text-foreground",
                      )}
                    >
                      {letter}. {opt}
                      {isAnswer && <Check className="inline h-3 w-3 ml-1" />}
                    </div>
                  );
                })}
              </div>
              {question.explanation && (
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  <span className="font-medium">解析：</span>
                  {question.explanation}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
              >
                编辑
              </Button>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function PreviewStep({
  questions,
  warnings,
  folders,
  onConfirm,
  onBack,
  isImporting,
  isParsing,
  parseProgress,
  totalChunks,
}: PreviewStepProps) {
  const [editedQuestions, setEditedQuestions] =
    useState<ParsedPdfQuestion[]>(questions);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [addToWrongBook, setAddToWrongBook] = useState(true);

  // 同步外部 questions 变化（增量追加）
  React.useEffect(() => {
    setEditedQuestions(questions);
  }, [questions]);

  const updateQuestion = (index: number, q: ParsedPdfQuestion) => {
    setEditedQuestions((prev) => {
      const copy = [...prev];
      copy[index] = q;
      return copy;
    });
  };

  const handleConfirm = () => {
    const folderId = selectedFolderId ? Number(selectedFolderId) : undefined;
    onConfirm(editedQuestions, folderId, addToWrongBook);
  };

  return (
    <div className="space-y-4">
      {/* 解析进度 */}
      {isParsing && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-blue-800 font-medium">
                    正在解析... 已完成 {parseProgress}/{totalChunks} 块
                  </span>
                  <span className="text-blue-600">
                    {totalChunks > 0
                      ? Math.round((parseProgress / totalChunks) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${totalChunks > 0 ? (parseProgress / totalChunks) * 100 : 0}%`,
                    }}
                  />
                </div>
                {questions.length > 0 && (
                  <p className="text-xs text-blue-700 mt-1">
                    已识别 {questions.length} 道题目，可立即编辑下方已解析的题目
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 警告信息 */}
      {warnings.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <ul className="text-sm text-yellow-800 space-y-1">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm text-muted-foreground">
          {isParsing ? (
            <>
              已识别{" "}
              <span className="font-medium text-foreground">
                {questions.length}
              </span>{" "}
              道题目 （解析中...）
            </>
          ) : (
            <>
              共{" "}
              <span className="font-medium text-foreground">
                {questions.length}
              </span>{" "}
              道题目
              {questions.filter((q) => q.confidence < 50).length > 0 && (
                <span className="text-yellow-600 ml-2">
                  （{questions.filter((q) => q.confidence < 50).length}{" "}
                  道低置信度）
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox
              checked={addToWrongBook}
              onCheckedChange={(checked) => setAddToWrongBook(checked === true)}
            />
            <span>加入错题本和复习队列</span>
          </label>

          <div className="w-48">
            <Select
              value={selectedFolderId}
              onValueChange={setSelectedFolderId}
            >
              <SelectTrigger>
                <FolderOpen className="h-4 w-4 mr-2 shrink-0" />
                <SelectValue placeholder="选择文件夹（可选）" />
              </SelectTrigger>
              <SelectContent>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            onClick={onBack}
            disabled={isImporting || isParsing}
          >
            返回
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isImporting || isParsing || questions.length === 0}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                导入中...
              </>
            ) : (
              `确认导入 ${questions.length} 题`
            )}
          </Button>
        </div>
      </div>

      {/* 题目列表 */}
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {questions.map((q, i) => (
          <QuestionCard
            key={i}
            index={i}
            question={q}
            onUpdate={(updated) => updateQuestion(i, updated)}
          />
        ))}
        {isParsing && questions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            AI 正在解析第一块题目...
          </div>
        )}
      </div>
    </div>
  );
}
