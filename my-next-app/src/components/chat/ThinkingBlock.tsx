/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import React, { useState, useEffect, useRef, useMemo, memo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  BrainCircuit,
} from "lucide-react";

interface ThinkingBlockProps {
  content: string;
  isThinking: boolean;
  thinkingTimeMs?: number;
}

/**
 * 移植自 Cherry Studio 的思维链显示组件
 * 支持展开/折叠、自增计数器和打字机效果
 */
const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  content,
  isThinking,
  thinkingTimeMs = 0,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  // 模拟 Cherry Studio 的计时器逻辑
  const [displayTime, setDisplayTime] = useState(thinkingTimeMs);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isThinking) {
      if (!timer.current) {
        timer.current = setInterval(() => {
          setDisplayTime((prev) => prev + 100);
        }, 100);
      }
    } else {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      setDisplayTime(thinkingTimeMs);
    }

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [isThinking, thinkingTimeMs]);

  const thinkingTimeSeconds = useMemo(() => {
    return (Math.max(100, displayTime) / 1000).toFixed(1);
  }, [displayTime]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!content) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-muted/30 overflow-hidden transition-all">
      {/* Header / Toggle */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-muted transition-colors group"
      >
        <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
          <BrainCircuit
            className={`w-3.5 h-3.5 ${isThinking ? "animate-pulse text-primary" : ""}`}
          />
          <span>
            {isThinking
              ? `正在思考 (${thinkingTimeSeconds}s)...`
              : `已深度思考 (${thinkingTimeSeconds}s)`}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 ml-1" />
          ) : (
            <ChevronRight className="w-3 h-3 ml-1" />
          )}
        </div>

        {!isThinking && isExpanded && (
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-background/80 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {/* Content Area */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 text-sm text-muted-foreground/80 italic font-serif leading-relaxed border-t border-border/50 whitespace-pre-wrap">
          {content}
          {isThinking && (
            <span className="inline-block w-1 h-3 ml-1 bg-primary/50 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
};

export default memo(ThinkingBlock);
