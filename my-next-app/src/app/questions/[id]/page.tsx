/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { use, useEffect, useState } from "react";
import { getQuestionByIdAction } from "@/server/actions/question-detail";
import { Question } from "@/types";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const questionId = parseInt(id, 10);
    if (isNaN(questionId)) {
      setLoading(false);
      setError("无效的题目 ID");
      return;
    }

    getQuestionByIdAction(questionId).then((result) => {
      setLoading(false);
      if (result.success && result.question) {
        setQuestion(result.question);
      } else {
        setError(result.message || "加载失败");
      }
    });
  }, [id]);

  // 题型中文映射
  const typeLabel: Record<string, string> = {
    single_choice: "单选题",
    multiple_choice: "多选题",
    true_false: "判断题",
  };

  // 解析选项
  const parseOptions = (options: unknown): string[] => {
    if (Array.isArray(options)) return options;
    if (typeof options === "string") {
      try {
        return JSON.parse(options);
      } catch {
        return [];
      }
    }
    return [];
  };

  // 解析标签
  const parseTags = (tags: unknown): string[] => {
    if (Array.isArray(tags)) return tags;
    if (typeof tags === "string") {
      try {
        return JSON.parse(tags);
      } catch {
        return tags ? [tags] : [];
      }
    }
    return [];
  };

  // 解析答案
  const parseAnswer = (answer: unknown): string[] => {
    if (Array.isArray(answer)) return answer;
    if (typeof answer === "string") {
      try {
        const parsed = JSON.parse(answer);
        return Array.isArray(parsed) ? parsed : [answer];
      } catch {
        return [answer];
      }
    }
    return [];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <XCircle className="h-16 w-16 text-destructive" />
        <p className="text-xl text-muted-foreground">{error || "题目不存在"}</p>
        <Button asChild variant="outline">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    );
  }

  const options = parseOptions(question.options);
  const tags = parseTags(question.tags);
  const correctAnswers = parseAnswer(question.answer);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        {/* 头部导航 */}
        <div className="mb-6">
          <Button
            variant="ghost"
            asChild
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <Link href="javascript:history.back()">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Link>
          </Button>
        </div>

        {/* 题目卡片 */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {/* 头部信息 */}
          <div className="flex items-center justify-between px-6 py-4 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg">
                {typeLabel[question.type] || question.type}
              </span>
              <span className="text-sm text-muted-foreground">
                #{question.id}
              </span>
            </div>
          </div>

          {/* 题目内容 */}
          <div className="p-6">
            <p className="text-lg text-foreground leading-relaxed whitespace-pre-wrap">
              {question.content}
            </p>
          </div>

          {/* 选项列表 */}
          {options.length > 0 && (
            <div className="px-6 pb-6 space-y-3">
              {options.map((option, idx) => {
                const optionLabel = String.fromCharCode(65 + idx); // A, B, C, D...
                const isCorrect = correctAnswers.includes(optionLabel);

                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                      isCorrect
                        ? "bg-green-500/10 border-green-500/30"
                        : "bg-muted/30 border-border"
                    }`}
                  >
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                        isCorrect
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {optionLabel}
                    </span>
                    <span className="flex-1 text-foreground">{option}</span>
                    {isCorrect && (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 答案（判断题） */}
          {(question.type as string) === "true_false" && (
            <div className="px-6 pb-6">
              <div className="flex items-center gap-2 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="font-medium text-green-600">
                  正确答案:{" "}
                  {correctAnswers[0] === "true" || correctAnswers[0] === "T"
                    ? "正确 ✓"
                    : "错误 ✗"}
                </span>
              </div>
            </div>
          )}

          {/* 解析 */}
          {question.explanation && (
            <div className="px-6 pb-6">
              <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <h3 className="font-semibold text-blue-600 mb-2">📖 解析</h3>
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                  {question.explanation}
                </p>
              </div>
            </div>
          )}

          {/* 知识点标签 */}
          {tags.length > 0 && (
            <div className="px-6 pb-6">
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-block px-3 py-1 text-sm rounded-full bg-primary/10 text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
