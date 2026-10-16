"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import type { PromptTemplate } from "@/lib/services/prompt";

interface DebugPlaygroundProps {
  editingPrompt: PromptTemplate | null;
  debugVariables: Record<string, string>;
  debugResult: string | null;
  isDebugLoading: boolean;
  onDebug: () => void;
  onVariableChange: (key: string, value: string) => void;
}

export function DebugPlayground({
  editingPrompt,
  debugVariables,
  debugResult,
  isDebugLoading,
  onDebug,
  onVariableChange,
}: DebugPlaygroundProps) {
  if (!editingPrompt) {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border h-full flex items-center justify-center text-muted-foreground text-sm">
        选择提示词后可进行调试
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border h-full flex flex-col w-80 shrink-0">
      <div className="p-4 border-b border-border bg-muted/30">
        <h3 className="font-bold text-foreground flex items-center">
          <Play className="w-4 h-4 mr-2 text-green-600 dark:text-green-500" />
          调试 Playground
        </h3>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 overflow-y-auto space-y-4 border-b border-border max-h-[40%] bg-background/50">
          <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            输入变量
          </h4>
          {(editingPrompt.variables || []).map((v: string) => (
            <div key={v}>
              <label className="block text-[11px] text-muted-foreground mb-1 font-mono">
                {v}
              </label>
              <input
                type="text"
                className="w-full text-sm p-2 border border-border rounded bg-background focus:ring-1 focus:ring-primary outline-none text-foreground"
                value={debugVariables[v] || ""}
                onChange={(e) => onVariableChange(v, e.target.value)}
                placeholder={`输入 ${v}...`}
              />
              {editingPrompt.variableExamples?.[v] && (
                <p className="text-[10px] text-muted-foreground/60 mt-1 italic">
                  示例: {editingPrompt.variableExamples[v]}
                </p>
              )}
            </div>
          ))}
          <Button
            className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-600"
            size="sm"
            onClick={onDebug}
            disabled={isDebugLoading}
          >
            {isDebugLoading ? "生成中..." : "运行测试"}
          </Button>
        </div>
        <div className="flex-1 bg-zinc-950 p-4 overflow-auto relative group">
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-gray-500 bg-black/50 px-2 py-1 rounded">
              {editingPrompt.template ? "使用自定义内容" : "使用系统默认"}
            </span>
          </div>
          <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-wider">
            输出结果
          </h4>
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
            {debugResult ||
              (isDebugLoading ? "正在等候 AI 响应..." : "暂无结果")}
          </pre>
        </div>
      </div>
    </div>
  );
}
