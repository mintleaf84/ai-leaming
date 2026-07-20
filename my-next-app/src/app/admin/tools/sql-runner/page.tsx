"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Database,
  Trash2,
  History,
} from "lucide-react";
import { toast } from "sonner";

interface SqlHistory {
  id: number;
  timestamp: string | Date;
  userId: number;
  description: string;
  success: boolean;
  rowsAffected: number | null;
  executionTime: number | null;
  backupFile: string | null;
  error: string | null;
}

export default function SqlRunnerPage() {
  const [sql, setSql] = useState("");
  const [description, setDescription] = useState("");
  const [validating, setValidating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
    warnings?: string[];
    estimatedRows?: number | null;
  } | null>(null);
  const [history, setHistory] = useState<SqlHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/admin/sql-scripts/history");
      const data = await res.json();
      setHistory(data.history || []);
    } catch (error) {
      console.error("加载历史失败:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleValidate = async () => {
    if (!sql.trim()) {
      toast.error("请输入 SQL 语句");
      return;
    }

    setValidating(true);
    try {
      const res = await fetch("/api/admin/sql-scripts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, description }),
      });
      const data = await res.json();
      setValidationResult(data);

      if (data.valid) {
        toast.success("SQL 验证通过");
      } else {
        toast.error(data.error || "验证失败");
      }
    } catch (error) {
      toast.error("验证请求失败");
    } finally {
      setValidating(false);
    }
  };

  const handleExecute = async () => {
    if (!sql.trim() || !description.trim()) {
      toast.error("请输入 SQL 语句和脚本描述");
      return;
    }

    if (!validationResult?.valid) {
      toast.error("请先通过验证");
      return;
    }

    if (
      !confirm(
        `确定要执行以下 SQL 脚本吗？\n\n描述: ${description}\n\n${sql.substring(0, 100)}...`,
      )
    ) {
      return;
    }

    if (!confirm("⚠️ 此操作会自动备份数据库，执行后无法撤销。是否继续？")) {
      return;
    }

    setExecuting(true);
    try {
      const res = await fetch("/api/admin/sql-scripts/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, description }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`执行成功！影响行数: ${data.rowsAffected}`);
        setSql("");
        setDescription("");
        setValidationResult(null);
        loadHistory();
      } else {
        toast.error(data.error || "执行失败");
      }
    } catch (error) {
      toast.error("执行请求失败");
    } finally {
      setExecuting(false);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("确定要清理过期的 SQL 脚本备份吗？")) {
      return;
    }

    try {
      const res = await fetch("/api/admin/sql-scripts/cleanup", {
        method: "POST",
      });
      const data = await res.json();
      toast.success(`已清理 ${data.deleted} 个过期备份文件`);
    } catch (error) {
      toast.error("清理失败");
    }
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6" />
            SQL 脚本执行器
          </h2>
          <p className="text-muted-foreground mt-1">
            安全执行 SQL 脚本，自动备份数据库，支持快速回滚
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCleanup}>
            <Trash2 className="mr-2 h-4 w-4" />
            清理备份
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：SQL 编辑器 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-500" />
                SQL 脚本
              </CardTitle>
              <CardDescription>
                输入要执行的 SQL 语句，系统会自动进行安全检查
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">脚本描述</Label>
                <Input
                  id="description"
                  placeholder="例如：修复填空题内容显示问题"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sql">SQL 语句</Label>
                <Textarea
                  id="sql"
                  placeholder="SELECT * FROM questions WHERE type = 'fill_blank';"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  className="font-mono min-h-[200px]"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleValidate}
                  disabled={validating || !sql.trim()}
                >
                  {validating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="mr-2 h-4 w-4" />
                  )}
                  验证脚本
                </Button>
                <Button
                  onClick={handleExecute}
                  disabled={
                    executing ||
                    !sql.trim() ||
                    !description.trim() ||
                    !validationResult?.valid
                  }
                  className="bg-green-600 hover:bg-green-700"
                >
                  {executing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  执行脚本
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 验证结果 */}
          {validationResult && (
            <Card
              className={
                validationResult.valid
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800"
              }
            >
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  {validationResult.valid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-1" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 mt-1" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {validationResult.valid ? "验证通过" : "验证失败"}
                    </p>
                    {validationResult.error && (
                      <p className="text-red-500 text-sm mt-1">
                        {validationResult.error}
                      </p>
                    )}
                    {validationResult.warnings &&
                      validationResult.warnings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {validationResult.warnings.map((warning, i) => (
                            <p key={i} className="text-yellow-600 text-sm">
                              ⚠️ {warning}
                            </p>
                          ))}
                        </div>
                      )}
                    {validationResult.estimatedRows !== null &&
                      validationResult.estimatedRows !== undefined && (
                        <p className="mt-2 text-blue-600 text-sm">
                          预估影响行数: {validationResult.estimatedRows}
                        </p>
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：执行历史 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                执行历史
              </CardTitle>
              <CardDescription>最近 20 条脚本执行记录</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  暂无执行记录
                </p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {item.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                            )}
                            <span className="font-medium truncate">
                              {item.description}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(item.timestamp)}
                            </span>
                            {item.rowsAffected !== null && (
                              <span>影响行数: {item.rowsAffected}</span>
                            )}
                            {item.executionTime !== null && (
                              <span>耗时: {item.executionTime}ms</span>
                            )}
                          </div>
                          {item.error && (
                            <p className="mt-2 text-sm text-red-500">
                              错误: {item.error}
                            </p>
                          )}
                          {item.backupFile && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              备份: {item.backupFile}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant={item.success ? "default" : "destructive"}
                        >
                          {item.success ? "成功" : "失败"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 安全提示 */}
      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                安全提示
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm mt-2 text-yellow-700 dark:text-yellow-300">
                <li>系统会自动拦截危险操作（DROP、TRUNCATE、ALTER 等）</li>
                <li>DELETE 和 UPDATE 语句必须包含 WHERE 条件</li>
                <li>执行前会自动创建数据库备份，支持快速回滚</li>
                <li>建议先在验证区测试，确认无误后再执行</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
