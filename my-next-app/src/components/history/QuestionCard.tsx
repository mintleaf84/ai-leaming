"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
} from "react";
import { getErrorMessage } from "@/lib/utils/error";
import {
  CheckCircle2,
  XCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/utils/security";
import { AnnotatableText } from "./AnnotatableText";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateMnemonicAction } from "@/server/actions/ai-mnemonic";
import { generateFirstPrinciplesAction } from "@/server/actions/ai";
import { submitQuestionFeedbackAction } from "@/server/actions/feedback";
import { OptionsList } from "./QuestionCard/OptionsList";
import { StatsBar } from "./QuestionCard/StatsBar";
import { AIAnalysisSection } from "./QuestionCard/AIAnalysisSection";
import { AIMnemonicSection } from "./QuestionCard/AIMnemonicSection";
import { AIReviewSection } from "./QuestionCard/AIReviewSection";
import { FeedbackDialog } from "./QuestionCard/FeedbackDialog";
export { parseAnswer } from "./QuestionCard/OptionsList";

export interface QuestionLogData {
  questionId?: number;
  questionContent: string;
  options: string[];
  correctAnswer: string;
  userAnswer: string;
  isCorrect: boolean;
  duration: number;
  tags: string[];
  source: string;
  explanation: string;
  correctRatio?: number | null;
  mostWrongAnswer?: string | null;
  reviewData?: unknown;
  aiMnemonic?: string | null;
  material?: string | null;
  materialHtml?: string | null;
}

type FeedbackType =
  "wrong_answer" | "wrong_content" | "wrong_explanation" | "other";

interface QuestionCardProps {
  log: QuestionLogData;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export const QuestionCard = React.memo(
  forwardRef<HTMLDivElement, QuestionCardProps>(
    ({ log, index, isExpanded, onToggle }, ref) => {
      const [fpAnalysis, setFpAnalysis] = useState<string | null>(null);
      const [isLoadingFP, setIsLoadingFP] = useState(false);
      const [mnemonic, setMnemonic] = useState<string | null>(
        log.aiMnemonic || null,
      );
      const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);
      const isMounted = useRef(true);

      const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
      const [feedbackType, setFeedbackType] =
        useState<FeedbackType>("wrong_answer");
      const [feedbackDescription, setFeedbackDescription] = useState("");
      const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

      useEffect(() => {
        isMounted.current = true;
        return () => {
          isMounted.current = false;
        };
      }, []);

      const handleFirstPrinciples = useCallback(
        async (force = false) => {
          if (fpAnalysis && !force) return;
          setIsLoadingFP(true);
          try {
            const result = await generateFirstPrinciplesAction(
              log.questionContent,
              log.explanation,
              log.correctAnswer,
              log.isCorrect ? undefined : log.userAnswer,
              force,
            );
            if (isMounted.current) {
              setFpAnalysis(result.analysis || null);
              if (force && !result.cached) {
                toast.success("重新解析成功！");
              }
            }
          } catch (error: unknown) {
            console.error("第一性原理分析失败:", error);
            if (isMounted.current)
              toast.error(getErrorMessage(error, "分析失败，请稍后重试"));
          } finally {
            if (isMounted.current) setIsLoadingFP(false);
          }
        },
        [
          fpAnalysis,
          log.questionContent,
          log.explanation,
          log.correctAnswer,
          log.isCorrect,
          log.userAnswer,
        ],
      );

      const handleGenerateMnemonic = useCallback(
        async (force = false) => {
          if ((!force && mnemonic) || isGeneratingMnemonic || !log.questionId)
            return;

          setIsGeneratingMnemonic(true);
          try {
            const result = await generateMnemonicAction(
              String(log.questionId),
              force,
            );
            if (!isMounted.current) return;

            if (result.success && result.content) {
              setMnemonic(result.content);
              if (!result.cached) {
                toast.success(force ? "重新生成成功！" : "记忆口诀生成成功！");
              }
            } else {
              toast.error(result.message || "生成失败");
            }
          } catch (error) {
            console.error("助记生成失败:", error);
            if (isMounted.current) toast.error("请求出错，请稍后重试");
          } finally {
            if (isMounted.current) setIsGeneratingMnemonic(false);
          }
        },
        [mnemonic, isGeneratingMnemonic, log.questionId],
      );

      const handleSubmitFeedback = useCallback(async () => {
        if (!log.questionId) {
          toast.error("无法提交反馈，题目 ID 不存在");
          return;
        }

        setIsSubmittingFeedback(true);
        try {
          const result = await submitQuestionFeedbackAction({
            questionId: log.questionId,
            feedbackType,
            description: feedbackDescription || undefined,
          });

          if (result.serverError) {
            toast.error(result.serverError);
          } else if (result.data?.success) {
            toast.success("感谢反馈！题目纠错已提交");
            setShowFeedbackDialog(false);
            setFeedbackDescription("");
          } else {
            toast.error(result.data?.message || "提交失败");
          }
        } catch (error) {
          console.error("提交反馈失败:", error);
          toast.error("提交失败，请稍后重试");
        } finally {
          setIsSubmittingFeedback(false);
        }
      }, [log.questionId, feedbackType, feedbackDescription]);

      const refCallback = useCallback(
        (node: HTMLDivElement | null) => {
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        },
        [ref],
      );

      const hasMaterial = !!log.materialHtml;

      return (
        <>
          <div
            ref={refCallback}
            className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden scroll-mt-24 md:scroll-mt-20"
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: "0 300px",
            }}
          >
            <div
              className={`flex flex-col md:flex-row ${hasMaterial ? "md:h-[600px]" : ""}`}
            >
              {hasMaterial && (
                <div className="md:w-1/2 p-5 border-b md:border-b-0 md:border-r border-border bg-muted/10 overflow-auto scrollbar-thin">
                  <div className="sticky top-0 z-10 mb-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      材料
                    </span>
                  </div>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(log.materialHtml || ""),
                    }}
                  />
                </div>
              )}

              <div
                className={`flex flex-col ${hasMaterial ? "md:w-1/2 md:h-full md:overflow-auto scrollbar-thin" : "w-full"}`}
              >
                <div
                  className={`p-5 flex-1 ${log.isCorrect ? "border-l-4 border-l-green-500" : "border-l-4 border-l-red-500"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-bold text-muted-foreground">
                        {index + 1}.
                      </span>
                      {log.isCorrect ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-medium text-foreground leading-relaxed"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(log.questionContent),
                        }}
                      />

                      {log.options.length > 0 && (
                        <OptionsList
                          options={log.options}
                          correctAnswer={log.correctAnswer}
                          userAnswer={log.userAnswer}
                          isCorrect={log.isCorrect}
                        />
                      )}
                    </div>
                  </div>

                  <StatsBar
                    correctAnswer={log.correctAnswer}
                    userAnswer={log.userAnswer}
                    isCorrect={log.isCorrect}
                    duration={log.duration}
                    options={log.options}
                    correctRatio={log.correctRatio}
                    mostWrongAnswer={log.mostWrongAnswer}
                  />

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={onToggle}
                      className="flex-1 flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors py-2 border border-border/50 rounded-lg hover:bg-muted/50"
                    >
                      {isExpanded ? (
                        <>
                          收起详情 <ChevronUp className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          查看解析 <ChevronDown className="h-4 w-4" />
                        </>
                      )}
                    </button>
                    {log.questionId && (
                      <button
                        onClick={() => setShowFeedbackDialog(true)}
                        className="px-3 flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-amber-600 transition-colors py-2 border border-border/50 rounded-lg hover:bg-amber-500/10"
                        title="题目有误？反馈给我们"
                      >
                        <Flag className="h-4 w-4" />
                        <span className="hidden sm:inline">题目有误</span>
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border">
                    <AIAnalysisSection
                      fpAnalysis={fpAnalysis}
                      isLoading={isLoadingFP}
                      onGenerate={handleFirstPrinciples}
                      questionId={log.questionId}
                    />

                    {log.explanation && (
                      <div className="p-5 bg-blue-500/5">
                        <div className="flex items-center gap-2 mb-3 text-blue-700 dark:text-blue-400 font-bold text-sm">
                          <BookOpen className="h-4 w-4" />
                          详细解析
                        </div>
                        {log.questionId ? (
                          <AnnotatableText
                            text={log.explanation}
                            questionId={log.questionId}
                            className="text-sm text-foreground"
                          />
                        ) : (
                          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                            {log.explanation}
                          </div>
                        )}
                      </div>
                    )}

                    <AIMnemonicSection
                      mnemonic={mnemonic}
                      isGenerating={isGeneratingMnemonic}
                      onGenerate={handleGenerateMnemonic}
                      questionId={log.questionId}
                    />

                    <div className="p-5 bg-muted/30 space-y-3">
                      {log.tags.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-muted-foreground mb-2">
                            考点
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {log.tags.map((tag, i) => {
                              const parts = tag.split("/");
                              const leaf = parts[parts.length - 1];
                              const fullPath = parts.join(" > ");

                              return (
                                <TooltipProvider key={i}>
                                  <Tooltip delayDuration={300}>
                                    <TooltipTrigger asChild>
                                      <span className="px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full cursor-help hover:bg-primary/20 transition-colors">
                                        {leaf}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">{fullPath}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {log.source && (
                        <div>
                          <div className="text-xs font-bold text-muted-foreground mb-1">
                            来源
                          </div>
                          <div className="text-sm text-blue-600 dark:text-blue-400">
                            {log.source}
                          </div>
                        </div>
                      )}
                    </div>

                    <AIReviewSection reviewDataRaw={log.reviewData} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <FeedbackDialog
            open={showFeedbackDialog}
            onOpenChange={setShowFeedbackDialog}
            feedbackType={feedbackType}
            setFeedbackType={setFeedbackType}
            feedbackDescription={feedbackDescription}
            setFeedbackDescription={setFeedbackDescription}
            isSubmitting={isSubmittingFeedback}
            onSubmit={handleSubmitFeedback}
          />
        </>
      );
    },
  ),
);

QuestionCard.displayName = "QuestionCard";
