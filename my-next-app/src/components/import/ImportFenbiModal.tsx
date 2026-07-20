"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Upload,
  X,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  FileText,
  Target,
  Percent,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import {
  importFenbiDataAction,
  previewFenbiDataAction,
  getImportTokenAction,
} from "@/server/actions/import";

interface ImportFenbiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportFenbiModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportFenbiModalProps) {
  const [exerciseJson, setExerciseJson] = useState("");
  const [solutionsJson, setSolutionsJson] = useState("");
  const [statsJson, setStatsJson] = useState(""); // 可选：统计数据
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<{
    sessionName: string;
    totalCount: number;
    correctCount: number;
    errorCount: number;
    accuracy: number;
    sampleQuestions: Array<{ content: string; type: string; tags: string[] }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importToken, setImportToken] = useState<string>("");

  // 获取导入 Token
  useEffect(() => {
    if (isOpen) {
      getImportTokenAction().then((result) => {
        if (result.data) setImportToken(result.data);
      });
    }
  }, [isOpen]);

  // 复制 Token
  const handleCopyToken = useCallback(() => {
    if (!importToken) return;
    navigator.clipboard.writeText(importToken).then(() => {
      toast.success("已复制通信凭证，请前往油猴脚本填写！");
    });
  }, [importToken]);

  // 验证并预览
  const handleValidate = useCallback(async () => {
    if (!exerciseJson.trim() || !solutionsJson.trim()) {
      setError("请填写两个 JSON 数据");
      return;
    }

    setIsValidating(true);
    setError(null);
    setPreview(null);

    const result = await previewFenbiDataAction({
      exerciseJson,
      solutionsJson,
      statsJson: statsJson || undefined,
    });

    if (result.serverError) {
      setError(result.serverError || "验证失败");
    } else if (result.data?.valid && result.data.preview) {
      setPreview(result.data.preview as NonNullable<typeof preview>);
    } else {
      setError(result.data?.error || "验证失败");
    }
    setIsValidating(false);
  }, [exerciseJson, solutionsJson, statsJson]);

  // 执行导入
  const handleImport = useCallback(async () => {
    setIsImporting(true);
    const result = await importFenbiDataAction({
      exerciseJson,
      solutionsJson,
      statsJson: statsJson || undefined,
    });

    if (result.serverError) {
      toast.error(result.serverError || "导入失败");
    } else if (result.data?.success) {
      toast.success(result.data.message, { duration: 5000 });
      onSuccess();
      onClose();
      // 重置状态
      setExerciseJson("");
      setSolutionsJson("");
      setStatsJson("");
      setPreview(null);
    } else {
      toast.error(result.data?.message || "导入失败");
    }
    setIsImporting(false);
  }, [exerciseJson, solutionsJson, statsJson, onSuccess, onClose]);

  // 关闭时重置
  const handleClose = useCallback(() => {
    setExerciseJson("");
    setSolutionsJson("");
    setStatsJson("");
    setPreview(null);
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* 对话框 */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col m-4">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                导入粉笔错题
              </h2>
              <p className="text-sm text-muted-foreground">
                从粉笔 APP 导入练习记录和题目
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 一键导入凭证 (新功能) */}
          {importToken && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-primary">⚡ 一键推流导入配置</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={handleCopyToken}
                >
                  <Copy className="w-3 h-3 mr-1" /> 复制通信凭证
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                将下方通讯凭证配置到“粉笔数据提取器
                3.0”中，即可实现免粘贴的直接推送入库，再也无需往返复制！
              </p>
              <div className="bg-muted p-2 rounded text-xs font-mono text-muted-foreground break-all max-h-16 overflow-hidden relative">
                {importToken}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-muted" />
              </div>
            </div>
          )}

          {/* 说明 */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 text-sm">
            <p className="font-medium text-blue-600 dark:text-blue-400 mb-2">
              📋 手动数据获取方式（备用）
            </p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>在粉笔 APP 中完成练习</li>
              <li>通过抓包工具获取以下 API 响应：</li>
            </ol>
            <ul className="ml-6 mt-1 space-y-0.5 text-muted-foreground">
              <li>
                • <code className="bg-muted px-1 rounded">getSolution</code> →
                答题情况（含 userAnswers）
              </li>
              <li>
                • <code className="bg-muted px-1 rounded">solution</code> →
                题目详情（含 solutions）
              </li>
              <li>
                • <code className="bg-muted px-1 rounded">getMeta</code> →
                统计数据（可选，含正确率）
              </li>
            </ul>
          </div>

          {/* 输入区域 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 答题数据 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                <FileJson className="w-4 h-4 text-primary" />
                getSolution 响应 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={exerciseJson}
                onChange={(e) => {
                  setExerciseJson(e.target.value);
                  setPreview(null);
                  setError(null);
                }}
                placeholder='粘贴 getSolution API 的响应 JSON（含 "userAnswers"）...'
                className="w-full h-32 p-3 border border-border rounded-lg bg-background text-sm font-mono resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            {/* 题目数据 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                <FileText className="w-4 h-4 text-primary" />
                solution 响应 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={solutionsJson}
                onChange={(e) => {
                  setSolutionsJson(e.target.value);
                  setPreview(null);
                  setError(null);
                }}
                placeholder='粘贴 solution API 的响应 JSON（含 "solutions"）...'
                className="w-full h-32 p-3 border border-border rounded-lg bg-background text-sm font-mono resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          {/* 统计数据（可选） */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              getMeta 响应（可选，含全站正确率）
            </label>
            <textarea
              value={statsJson}
              onChange={(e) => {
                setStatsJson(e.target.value);
                setPreview(null);
              }}
              placeholder="可选：粘贴 getMeta API 的响应 JSON..."
              className="w-full h-20 p-3 border border-border rounded-lg bg-background text-sm font-mono resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* 预览结果 */}
          {preview && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-600">数据验证通过</span>
              </div>

              <div className="p-4 space-y-4">
                {/* 会话信息 */}
                <div>
                  <div className="text-sm text-muted-foreground mb-1">
                    练习名称
                  </div>
                  <div className="font-medium">{preview.sessionName}</div>
                </div>

                {/* 统计 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <Target className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-xl font-bold">
                      {preview.totalCount}
                    </div>
                    <div className="text-xs text-muted-foreground">总题数</div>
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-3 text-center">
                    <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-green-600" />
                    <div className="text-xl font-bold text-green-600">
                      {preview.correctCount}
                    </div>
                    <div className="text-xs text-muted-foreground">正确</div>
                  </div>
                  <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                    <Percent className="w-4 h-4 mx-auto mb-1 text-blue-600" />
                    <div className="text-xl font-bold text-blue-600">
                      {preview.accuracy}%
                    </div>
                    <div className="text-xs text-muted-foreground">正确率</div>
                  </div>
                </div>

                {/* 题目预览 */}
                {preview.sampleQuestions.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">题目预览</div>
                    <div className="space-y-2">
                      {preview.sampleQuestions.map((q, i) => (
                        <div
                          key={i}
                          className="bg-muted/30 rounded-lg p-3 text-sm"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded">
                              {q.type}
                            </span>
                            {q.tags.slice(0, 2).map((tag, j) => (
                              <span
                                key={j}
                                className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="text-muted-foreground">
                            {q.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>

          {!preview ? (
            <Button
              onClick={handleValidate}
              disabled={
                isValidating || !exerciseJson.trim() || !solutionsJson.trim()
              }
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  验证中...
                </>
              ) : (
                "验证数据"
              )}
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={isImporting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  导入中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  确认导入
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
