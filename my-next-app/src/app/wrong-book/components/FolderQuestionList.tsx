"use client";

import React from "react";
import { Folder, FolderOpen, Layers } from "lucide-react";
import { WrongQuestionCard } from "./WrongQuestionCard";
import {
  type WrongQuestionItem,
  type WrongQuestionDetail,
} from "@/lib/services/wrong-question";

interface FolderQuestionListProps {
  folderName: string;
  isCustomFolder: boolean;
  questions: WrongQuestionItem[];
  selectedIds: Set<number>;
  expandedQuestionId: number | null;
  questionDetail: WrongQuestionDetail | null;
  isLoadingDetail: boolean;
  isRecommendLoading: boolean;
  onToggleSelect: (id: number) => void;
  onToggleDetail: (id: number) => void;
  onPractice: (questionIds: number[]) => void;
  onMarkAsMastered: (id: number) => void;
  onRecommendSimilar: (id: number) => void;
}

export function FolderQuestionList({
  folderName,
  isCustomFolder,
  questions,
  selectedIds,
  expandedQuestionId,
  questionDetail,
  isLoadingDetail,
  isRecommendLoading,
  onToggleSelect,
  onToggleDetail,
  onPractice,
  onMarkAsMastered,
  onRecommendSimilar,
}: FolderQuestionListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        {isCustomFolder ? (
          <FolderOpen className="w-5 h-5 text-blue-500" />
        ) : (
          <Layers className="w-5 h-5 text-amber-500" />
        )}
        <h3 className="text-lg font-semibold">{folderName}</h3>
        <span className="text-sm text-muted-foreground">
          ({questions.length} 题)
        </span>
      </div>

      {questions.length === 0 ? (
        <div className="bg-card rounded-2xl p-12 text-center border border-dashed border-border">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <Folder className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="text-lg font-medium text-foreground">
            该文件夹暂无题目
          </h3>
          <p className="text-muted-foreground mt-2">
            选中错题后使用「添加到文件夹」功能归类
          </p>
        </div>
      ) : (
        questions.map((q, index) => (
          <div
            key={q.questionId}
            className="animate-fade-in-up"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <WrongQuestionCard
              question={q}
              isSelected={selectedIds.has(q.questionId)}
              isExpanded={expandedQuestionId === q.questionId}
              detail={
                expandedQuestionId === q.questionId ? questionDetail : null
              }
              isLoadingDetail={isLoadingDetail}
              onToggleSelect={() => onToggleSelect(q.questionId)}
              onToggleDetail={() => onToggleDetail(q.questionId)}
              onPractice={() => onPractice([q.questionId])}
              onMarkAsMastered={() => onMarkAsMastered(q.questionId)}
              onRecommendSimilar={() => onRecommendSimilar(q.questionId)}
              isRecommendLoading={isRecommendLoading}
            />
          </div>
        ))
      )}
    </div>
  );
}
