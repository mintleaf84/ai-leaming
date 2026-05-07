'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UploadStep } from './components/UploadStep';
import { PreviewStep } from './components/PreviewStep';
import { getImportFoldersAction } from '@/server/actions/pdf-import';
import type { ParsedPdfQuestion } from '@/types/pdf-import';
import type { QuestionFolder } from '@/lib/services/question-folder';

type Step = 'upload' | 'preview';

export default function PdfImportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [questions, setQuestions] = useState<ParsedPdfQuestion[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [folders, setFolders] = useState<QuestionFolder[]>([]);
  const taskIdRef = useRef<string | null>(null);

  useEffect(() => {
    getImportFoldersAction().then((result) => {
      if (result.data) setFolders(result.data);
    });
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/pdf-import/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: AbortSignal.timeout(300_000), // OCR 阶段 5 分钟
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      taskIdRef.current = data.taskId;
      setTotalChunks(data.totalChunks);
      setQuestions([]);
      setWarnings([]);
      setParseProgress(0);
      setStep('preview');
      setIsProcessing(false);

      // 启动并发解析
      startConcurrentParsing(data.taskId, data.totalChunks);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'TimeoutError'
        ? 'OCR 请求超时，请重试'
        : `处理失败: ${err instanceof Error ? err.message : '请重试'}`;
      toast.error(msg);
      setIsProcessing(false);
    }
  }, []);

  const handleTextSubmit = useCallback(async (text: string) => {
    setIsProcessing(true);

    try {
      const res = await fetch('/api/pdf-import/text-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      taskIdRef.current = data.taskId;
      setTotalChunks(data.totalChunks);
      setQuestions([]);
      setWarnings([]);
      setParseProgress(0);
      setStep('preview');
      setIsProcessing(false);

      startConcurrentParsing(data.taskId, data.totalChunks);
    } catch (err) {
      toast.error(`处理失败: ${err instanceof Error ? err.message : '请重试'}`);
      setIsProcessing(false);
    }
  }, []);

  const startConcurrentParsing = useCallback(async (taskId: string, chunks: number) => {
    setIsParsing(true);
    setParseProgress(0);

    const queue = Array.from({ length: chunks }, (_, i) => i);
    const CONCURRENCY = 5;
    const active = new Set<Promise<void>>();
    const chunkWarnings: string[] = [];

    const fetchChunk = async (chunkIndex: number) => {
      try {
        const res = await fetch('/api/pdf-import/parse-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ taskId, chunkIndex }),
          signal: AbortSignal.timeout(300_000), // 每块 5 分钟
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '请求失败' }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        if (data.questions?.length > 0) {
          setQuestions(prev => [...prev, ...data.questions]);
        }
        if (data.warnings?.length > 0) {
          chunkWarnings.push(...data.warnings);
        }
      } catch (err) {
        const msg = `第 ${chunkIndex + 1} 块解析失败: ${err instanceof Error ? err.message : '请重试'}`;
        chunkWarnings.push(msg);
        console.error(msg);
      }
    };

    while (queue.length > 0 || active.size > 0) {
      while (queue.length > 0 && active.size < CONCURRENCY) {
        const idx = queue.shift()!;
        const p = fetchChunk(idx).then(() => {
          setParseProgress(prev => prev + 1);
        }).finally(() => active.delete(p));
        active.add(p);
      }
      if (active.size > 0) await Promise.race(active);
    }

    if (chunkWarnings.length > 0) {
      setWarnings(chunkWarnings);
    }

    setIsParsing(false);

    // 清理服务端缓存
    try {
      await fetch('/api/pdf-import/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId }),
      });
    } catch {
      // 非关键操作，忽略错误
    }
  }, []);

  const handleConfirm = useCallback(async (finalQuestions: ParsedPdfQuestion[], folderId?: number, addToWrongBook?: boolean) => {
    setIsImporting(true);
    try {
      const res = await fetch('/api/pdf-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          questions: finalQuestions,
          folderId,
          addToWrongBook: addToWrongBook ?? true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.success) {
        toast.success(data.message);
        setStep('upload');
        setQuestions([]);
        setWarnings([]);
      } else {
        toast.error(data.message || '导入失败');
      }
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'TimeoutError'
        ? '导入超时，请重试'
        : `导入失败: ${err instanceof Error ? err.message : '请重试'}`;
      toast.error(msg);
    } finally {
      setIsImporting(false);
    }
  }, []);

  return (
    <div className="container mx-auto max-w-4xl py-6 px-4 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/wrong-book">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回错题本
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">错题导入</h1>
      </div>

      {step === 'upload' ? (
        <UploadStep
          onFileSelected={handleFileSelected}
          onTextSubmit={handleTextSubmit}
          isProcessing={isProcessing}
          progressStage="ocr"
          progressDetail="正在 OCR 识别..."
        />
      ) : (
        <PreviewStep
          questions={questions}
          warnings={warnings}
          folders={folders}
          onConfirm={handleConfirm}
          onBack={() => { setStep('upload'); setQuestions([]); setWarnings([]); }}
          isImporting={isImporting}
          isParsing={isParsing}
          parseProgress={parseProgress}
          totalChunks={totalChunks}
        />
      )}
    </div>
  );
}
