"use client";

import React from "react";
import { X, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";

const MarkdownViewer = dynamic(
  () => import("@/components/chat/MarkdownViewer"),
  {
    ssr: false,
    loading: () => <div className="h-20 animate-pulse bg-muted rounded-xl" />,
  },
);
import type { KnowledgeCard } from "@/lib/services/knowledge";

interface StudyModeOverlayProps {
  cards: KnowledgeCard[];
  studyIndex: number;
  studyFlipped: boolean;
  toggleFlip: () => void;
  onNext: () => void;
  onPrev: () => void;
  onExit: () => void;
}

export const StudyModeOverlay: React.FC<StudyModeOverlayProps> = ({
  cards,
  studyIndex,
  studyFlipped,
  toggleFlip,
  onNext,
  onPrev,
  onExit,
}) => {
  if (!cards.length) return null;
  const currentCard = cards[studyIndex];

  return (
    <div className="fixed inset-0 bg-background z-[60] flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20">
            <Play className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-foreground font-bold tracking-tight">
              复习进行中
            </h2>
            <p className="text-muted-foreground text-xs font-mono">
              {studyIndex + 1} / {cards.length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {/* Progress Bar */}
          <div className="hidden md:block w-64 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
              style={{ width: `${((studyIndex + 1) / cards.length) * 100}%` }}
            ></div>
          </div>
          <Button
            variant="ghost"
            onClick={onExit}
            className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-full w-10 h-10 p-0"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>
      </div>

      {/* Main Card View */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full h-full flex flex-col justify-center gap-8">
          <div
            className={`relative w-full aspect-[16/10] md:max-h-[60vh] transition-all duration-700 cursor-pointer ${
              studyFlipped
                ? "rotate-y-180 shadow-[0_0_80px_rgba(16,185,129,0.3)]"
                : "shadow-[0_0_80px_rgba(59,130,246,0.3)]"
            }`}
            style={{
              transformStyle: "preserve-3d",
              transform: studyFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
            onClick={toggleFlip}
          >
            {/* Study Front */}
            <div
              className="absolute inset-0 backface-hidden bg-card rounded-[40px] border-4 border-border/50 overflow-y-auto scrollbar-thin shadow-2xl"
              style={{ backfaceVisibility: "hidden" }}
            >
              <div className="min-h-full p-12 flex flex-col">
                <div className="mb-8 shrink-0">
                  <span className="px-4 py-1.5 bg-blue-600 text-white text-sm font-black rounded-2xl shadow-lg uppercase tracking-widest">
                    Question
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <div className="prose prose-2xl max-w-none text-foreground font-medium leading-loose prose-headings:text-foreground prose-p:my-6 prose-p:text-3xl dark:prose-invert">
                    <MarkdownViewer
                      content={currentCard.front || currentCard.title}
                    />
                  </div>
                </div>
                <div className="mt-8 text-center animate-bounce shrink-0">
                  <p className="text-sm text-muted-foreground font-medium">
                    点击卡片或按“空格键”揭晓答案
                  </p>
                </div>
              </div>
            </div>

            {/* Study Back */}
            <div
              className="absolute inset-0 backface-hidden rotate-y-180 bg-muted/30 rounded-[40px] border-4 border-emerald-500/30 overflow-y-auto scrollbar-thin shadow-2xl"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <div className="min-h-full p-12 flex flex-col">
                <div className="mb-8 shrink-0">
                  <span className="px-4 py-1.5 bg-emerald-500 text-white text-sm font-black rounded-2xl shadow-lg uppercase tracking-widest">
                    Answer
                  </span>
                </div>
                <div className="flex-1 prose prose-2xl max-w-none text-foreground leading-loose prose-headings:text-foreground prose-ul:space-y-4 prose-p:text-2xl dark:prose-invert">
                  <MarkdownViewer content={currentCard.back || "暂无答案"} />

                  {currentCard.key_points &&
                    currentCard.key_points.length > 0 && (
                      <div className="mt-12 pt-8 border-t border-border/50">
                        <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-6 px-1">
                          要点回顾
                        </h4>
                        <div className="grid gap-4">
                          {currentCard.key_points.map((kp, i) => (
                            <div
                              key={i}
                              className="flex gap-4 p-5 bg-card rounded-3xl border border-border shadow-sm"
                            >
                              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2 shrink-0"></div>
                              <div>
                                <span className="block text-lg font-bold text-foreground mb-1">
                                  {kp.term}
                                </span>
                                <span className="block text-base text-muted-foreground leading-normal">
                                  {kp.definition}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
                <div className="mt-8 text-center text-muted-foreground/60 shrink-0">
                  <p className="text-sm font-medium">再次点击回到问题</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="p-8 bg-card/80 backdrop-blur border-t border-border flex items-center justify-center gap-4">
        <Button
          disabled={studyIndex === 0}
          onClick={onPrev}
          className="w-16 h-16 rounded-3xl bg-muted hover:bg-muted/80 text-foreground border-none transition-all p-0"
        >
          <ChevronLeft className="w-8 h-8" />
        </Button>

        <div className="flex gap-4">
          <Button
            onClick={toggleFlip}
            className="h-16 px-12 rounded-3xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg shadow-xl shadow-blue-500/20"
          >
            {studyFlipped ? "查看问题" : "查看答案"}
          </Button>

          {studyIndex < cards.length - 1 ? (
            <Button
              onClick={onNext}
              className="h-16 px-12 rounded-3xl bg-green-600 hover:bg-green-500 text-white font-bold text-lg shadow-xl shadow-green-500/20"
            >
              下一张卡片
            </Button>
          ) : (
            <Button
              onClick={onExit}
              className="h-16 px-12 rounded-3xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-lg shadow-xl shadow-orange-500/20"
            >
              完成本次回顾
            </Button>
          )}
        </div>

        <Button
          disabled={studyIndex === cards.length - 1}
          onClick={onNext}
          className="w-16 h-16 rounded-3xl bg-muted hover:bg-muted/80 text-foreground border-none transition-all p-0"
        >
          <ChevronRight className="w-8 h-8" />
        </Button>
      </div>

      {/* Keyboard Help Overlay */}
      <div className="absolute bottom-4 left-4 flex gap-4 text-[10px] text-muted-foreground/40 font-mono uppercase tracking-widest hidden md:flex">
        <span>[SPACE] 翻转</span>
        <span>[←] 上一张</span>
        <span>[→] 下一张</span>
        <span>[ESC] 退出</span>
      </div>
    </div>
  );
};
