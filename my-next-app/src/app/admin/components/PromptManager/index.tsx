"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  getPromptTemplatesAction,
  savePromptTemplateAction,
  resetPromptTemplateAction,
  debugPromptTemplateAction,
} from "@/server/actions/prompts";
import type { PromptTemplate } from "@/lib/services/prompt";
import { ErrorState } from "@/components/ui/error-state";
import { PromptList } from "./PromptList";
import { PromptEditor } from "./PromptEditor";
import { DebugPlayground } from "./DebugPlayground";

export function PromptManager() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDebugLoading, setIsDebugLoading] = useState(false);
  const [debugVariables, setDebugVariables] = useState<Record<string, string>>(
    {},
  );
  const [debugResult, setDebugResult] = useState<string | null>(null);
  // 首屏加载失败要显式呈现，否则会一直停在"正在加载提示词模板..."
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      const result = await getPromptTemplatesAction();
      // safe-action 的失败不抛异常：serverError / 没有 data 都是加载失败
      if (result?.serverError || !result?.data) {
        console.error("加载提示词模板失败", result?.serverError);
        setLoadError(result?.serverError || "服务器未返回提示词数据");
        return;
      }
      setPrompts(result.data);
      setLoadError(null);
    } catch (e) {
      console.error("加载提示词模板失败", e);
      setLoadError(e instanceof Error ? e.message : "请求失败");
      return;
    }
  };

  const handleSelectPrompt = (p: PromptTemplate) => {
    setEditingPrompt({ ...p, template: p.template || p.systemDefault || "" });
    setDebugResult(null);

    const initialVars: Record<string, string> = p.variableExamples || {};
    (p.variables || []).forEach((v: string) => {
      if (!initialVars[v]) initialVars[v] = "";
    });
    setDebugVariables(initialVars);
  };

  const handleSavePrompt = async () => {
    if (!editingPrompt) return;
    setIsSaving(true);
    try {
      const res = await savePromptTemplateAction({
        key: editingPrompt.key,
        template: editingPrompt.template,
        description: editingPrompt.description,
        variables: editingPrompt.variables,
      });
      // safe-action 的失败不抛异常：serverError / success === false 都要停下来
      if (res?.serverError || res?.data?.success === false || !res?.data) {
        console.error("保存提示词模板失败", res?.serverError);
        toast.error(
          "保存失败：" + (res?.serverError || "服务器未确认保存成功"),
        );
        return;
      }
      toast.success("提示词已保存");
      loadPrompts();
    } catch (e) {
      console.error("保存提示词模板失败", e);
      toast.error("请求失败: " + (e as Error).message);
      return;
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPrompt = async () => {
    if (
      !editingPrompt ||
      !confirm("确定要重置为系统默认提示词吗？您的自定义修改将丢失。")
    )
      return;

    try {
      const res = await resetPromptTemplateAction(editingPrompt.key);
      // safe-action 的失败不抛异常：serverError / success === false 都要停下来
      if (res?.serverError || res?.data?.success === false || !res?.data) {
        console.error("重置提示词模板失败", res?.serverError);
        toast.error(
          "重置失败：" + (res?.serverError || "服务器未确认重置成功"),
        );
        return;
      }
      toast.success("已重置");
    } catch (e) {
      console.error("重置提示词模板失败", e);
      toast.error("重置失败");
      return;
    }

    // 重置已经成功：下面只是刷新列表取回系统默认内容，
    // 刷新失败只能提示"请手动刷新"，不能改写成"重置失败"、也不置 loadError。
    try {
      const allResult = await getPromptTemplatesAction();
      if (allResult?.serverError || !allResult?.data) {
        console.warn("重置后刷新提示词列表失败", allResult?.serverError);
        toast.warning("列表刷新失败，请手动刷新");
        return;
      }
      const templates = allResult.data;
      setPrompts(templates);
      setLoadError(null);
      const fresh = templates.find(
        (x: PromptTemplate) => x.key === editingPrompt.key,
      );
      if (fresh) setEditingPrompt(fresh);
    } catch (e) {
      console.warn("重置后刷新提示词列表失败", e);
      toast.warning("列表刷新失败，请手动刷新");
      return;
    }
  };

  const handleRunDebug = async () => {
    if (!editingPrompt) return;
    setIsDebugLoading(true);
    setDebugResult(null);
    try {
      const res = await debugPromptTemplateAction({
        key: editingPrompt.key,
        template: editingPrompt.template,
        inputVariables: debugVariables,
      });
      // safe-action 的失败不抛异常：serverError 时先按请求失败处理
      if (res?.serverError) {
        console.error("调试提示词模板失败", res.serverError);
        toast.error("生成失败：" + res.serverError);
        setDebugResult("Error: " + res.serverError);
        return;
      }
      if (res?.data?.success) {
        setDebugResult(
          typeof res.data.result === "string"
            ? res.data.result
            : JSON.stringify(res.data.result, null, 2),
        );
      } else {
        toast.error("生成失败: " + (res.data?.error || "服务器未返回结果"));
        let errorMsg = "Error: " + (res.data?.error || "服务器未返回结果");
        if (res.data?.result) {
          errorMsg += "\n\n" + res.data.result;
        }
        setDebugResult(errorMsg);
      }
    } catch (e) {
      console.error("调试提示词模板失败", e);
      toast.error("调试请求失败");
      setDebugResult("Request Error: " + (e as Error).message);
      return;
    } finally {
      setIsDebugLoading(false);
    }
  };

  if (prompts.length === 0)
    return loadError ? (
      <ErrorState
        title="提示词加载失败"
        description={loadError}
        onRetry={() => void loadPrompts()}
      />
    ) : (
      <div className="p-8 text-center text-muted-foreground">
        正在加载提示词模板...
      </div>
    );

  return (
    <div className="flex h-[calc(100vh-200px)] gap-6 overflow-hidden">
      <PromptList
        prompts={prompts}
        selectedKey={editingPrompt?.key || null}
        onSelect={handleSelectPrompt}
      />
      {editingPrompt ? (
        <>
          <PromptEditor
            editingPrompt={editingPrompt}
            onChange={(val) =>
              setEditingPrompt({ ...editingPrompt, template: val })
            }
            onSave={handleSavePrompt}
            onReset={handleResetPrompt}
            isSaving={isSaving}
          />
          <DebugPlayground
            editingPrompt={editingPrompt}
            debugVariables={debugVariables}
            onVariableChange={(k, v) =>
              setDebugVariables((prev) => ({ ...prev, [k]: v }))
            }
            onDebug={handleRunDebug}
            isDebugLoading={isDebugLoading}
            debugResult={debugResult}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg border border-dashed border-border text-muted-foreground">
          请在左侧选择一个模板进行编辑或调试
        </div>
      )}
    </div>
  );
}
