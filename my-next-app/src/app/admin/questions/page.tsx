"use client";

import React from "react";
import { QuestionManager } from "../components/QuestionManager";

export default function QuestionsPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">题库管理</h1>
        <p className="text-muted-foreground mt-2">
          管理系统中的所有题目，支持 JSON 批量导入与删除操作。
        </p>
      </div>
      <QuestionManager />
    </div>
  );
}
