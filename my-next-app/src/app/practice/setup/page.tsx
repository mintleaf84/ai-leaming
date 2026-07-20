"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Brain,
  RotateCcw,
  Target,
  FileCheck,
  Shuffle,
  ArrowRight,
  ChevronLeft,
  Settings2,
  Loader2,
  Tag,
  BookOpen,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PracticeMode,
  PracticeConfig,
  PRACTICE_MODE_LABELS,
  PRACTICE_MODE_DESCRIPTIONS,
  PRESET_CONFIGS,
  DEFAULT_PRACTICE_CONFIG,
  QUESTION_LIMIT_OPTIONS,
  DIMENSION_LABELS,
  Dimension,
} from "@/types";
import { KeypointTree } from "@/components/practice/KeypointTree";

// 模式图标组件
const ModeIcons: Record<PracticeMode, React.ReactNode> = {
  smart: <Brain className="w-6 h-6" />,
  review: <RotateCcw className="w-6 h-6" />,
  mistakes: <AlertCircle className="w-6 h-6" />,
  focus: <Target className="w-6 h-6" />,
  exam: <FileCheck className="w-6 h-6" />,
  random: <Shuffle className="w-6 h-6" />,
};

// 模式颜色
const ModeColors: Record<PracticeMode, string> = {
  smart: "from-blue-500 to-indigo-600",
  review: "from-amber-500 to-orange-600",
  mistakes: "from-rose-500 to-red-600",
  focus: "from-green-500 to-emerald-600",
  exam: "from-purple-500 to-violet-600",
  random: "from-pink-500 to-rose-600",
};

export default function PracticeSetupPage() {
  const router = useRouter();
  const [config, setConfig] = useState<PracticeConfig>(DEFAULT_PRACTICE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const searchParams = useSearchParams();

  // 加载可用标签并处理初始模式
  useEffect(() => {
    const init = async () => {
      try {
        // 处理初始模式
        const initialMode = searchParams.get("mode") as PracticeMode;
        if (initialMode && PRESET_CONFIGS[initialMode]) {
          const preset = PRESET_CONFIGS[initialMode];
          setConfig((prev) => ({
            ...prev,
            mode: initialMode,
            limit: preset.limit ?? prev.limit,
            enableReview: preset.enableReview ?? prev.enableReview,
            enableTimer: preset.enableTimer ?? prev.enableTimer,
          }));
        }
      } catch (error) {
        console.error("加载初始化数据失败", error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [searchParams]);

  // 切换模式时应用预设配置
  const handleModeChange = (mode: PracticeMode) => {
    const preset = PRESET_CONFIGS[mode];
    setConfig({
      ...config,
      mode,
      limit: preset.limit ?? config.limit,
      enableReview: preset.enableReview ?? config.enableReview,
      enableTimer: preset.enableTimer ?? config.enableTimer,
    });
  };

  // 切换题目类型
  const toggleType = (
    type: "single" | "multi" | "truefalse" | "fill_blank",
  ) => {
    setConfig((prev) => ({
      ...prev,
      types: prev.types?.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...(prev.types || []), type],
    }));
  };

  // 切换维度
  const toggleDimension = (dim: Dimension) => {
    setConfig((prev) => ({
      ...prev,
      dimensions: prev.dimensions?.includes(dim)
        ? prev.dimensions.filter((d) => d !== dim)
        : [...(prev.dimensions || []), dim],
    }));
  };

  // 开始练习
  const startPractice = () => {
    const params = new URLSearchParams({
      mode: config.mode,
      limit: config.limit.toString(),
    });

    if (config.types && config.types.length > 0 && config.types.length < 2) {
      params.set("types", config.types.join(","));
    }
    if (config.tags && config.tags.length > 0) {
      params.set("tags", config.tags.join(","));
    }
    if (config.dimensions && config.dimensions.length > 0) {
      params.set("dimensions", config.dimensions.join(","));
    }
    if (config.enableTimer) {
      params.set("timer", "1");
    }
    if (!config.enableReview) {
      params.set("noReview", "1");
    }

    router.push(`/practice?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 pb-20">
      {/* 顶部导航 */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            返回首页
          </Link>
          <h1 className="font-bold text-lg">配置练习</h1>
          <div className="w-20" /> {/* 占位 */}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 模式选择 */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            选择练习模式
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(Object.keys(PRACTICE_MODE_LABELS) as PracticeMode[]).map(
              (mode) => {
                const isActive = config.mode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => handleModeChange(mode)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      isActive
                        ? "border-primary bg-primary/5 shadow-lg scale-[1.02]"
                        : "border-border hover:border-primary/50 bg-card"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${ModeColors[mode]} flex items-center justify-center text-white mb-2`}
                    >
                      {ModeIcons[mode]}
                    </div>
                    <div className="font-medium text-sm">
                      {PRACTICE_MODE_LABELS[mode]}
                    </div>
                    {isActive && (
                      <CheckCircle2 className="w-4 h-4 text-primary mt-1" />
                    )}
                  </button>
                );
              },
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-3 px-1">
            {PRACTICE_MODE_DESCRIPTIONS[config.mode]}
          </p>
        </section>

        {/* 题目数量 */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            题目数量
          </h2>
          <div className="flex flex-wrap gap-2">
            {QUESTION_LIMIT_OPTIONS.map((num) => (
              <button
                key={num}
                onClick={() => setConfig({ ...config, limit: num })}
                className={`px-4 py-2 rounded-lg border transition-all ${
                  config.limit === num
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                {num} 题
              </button>
            ))}
          </div>
        </section>

        {/* 高级选项 */}
        <section className="mb-8">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <Settings2 className="w-4 h-4" />
            {showAdvanced ? "收起高级选项" : "展开高级选项"}
            <ChevronLeft
              className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-90" : "-rotate-90"}`}
            />
          </button>

          {showAdvanced && (
            <Card>
              <CardContent className="pt-6 space-y-6">
                {/* 题目类型 */}
                <div>
                  <h3 className="font-medium mb-3">题目类型</h3>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={config.types?.includes("single") ?? true}
                        onCheckedChange={() => toggleType("single")}
                      />
                      <span>单选题</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={config.types?.includes("multi") ?? true}
                        onCheckedChange={() => toggleType("multi")}
                      />
                      <span>多选题</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={config.types?.includes("truefalse") ?? true}
                        onCheckedChange={() => toggleType("truefalse")}
                      />
                      <span>判断题</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={config.types?.includes("fill_blank") ?? true}
                        onCheckedChange={() => toggleType("fill_blank")}
                      />
                      <span>填空题</span>
                    </label>
                  </div>
                </div>

                {/* 认知维度 */}
                <div>
                  <h3 className="font-medium mb-3">认知维度 (可选)</h3>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(DIMENSION_LABELS) as Dimension[]).map(
                      (dim) => (
                        <button
                          key={dim}
                          onClick={() => toggleDimension(dim)}
                          className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                            config.dimensions?.includes(dim)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {DIMENSION_LABELS[dim]}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                {/* 知识点筛选 */}
                {(config.mode === "focus" || config.mode === "smart") && (
                  <div>
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      知识点筛选 (可选)
                    </h3>
                    <KeypointTree
                      selectedTags={config.tags || []}
                      onSelectionChange={(tags) =>
                        setConfig({ ...config, tags })
                      }
                      maxHeight="350px"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {/* 开始按钮 */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm border-t">
          <div className="container mx-auto max-w-4xl">
            <Button
              size="lg"
              className="w-full group text-lg h-14"
              onClick={startPractice}
            >
              <span className="mr-2">🚀</span>
              开始练习 ({config.limit} 题)
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
