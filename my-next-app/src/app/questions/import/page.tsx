'use client';

import React, { useState, useCallback, useEffect } from 'react';
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
  const [progressStage, setProgressStage] = useState('');
  const [progressDetail, setProgressDetail] = useState('');
  const [questions, setQuestions] = useState<ParsedPdfQuestion[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [folders, setFolders] = useState<QuestionFolder[]>([]);

  useEffect(() => {
    getImportFoldersAction().then((result) => {
      if (result.data) setFolders(result.data);
    });
  }, []);

  const handleFileSelected = useCallback(async (file: File) => {
    setIsProcessing(true);
    setProgressStage('ocr');
    setProgressDetail('正在 OCR 识别...');

    try {
      setTimeout(() => {
        setProgressStage('ai_parse');
        setProgressDetail('AI 智能解析中...');
      }, 3000);

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/pdf-import/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: AbortSignal.timeout(180_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setQuestions(data.questions);
      setWarnings(data.parseWarnings);

      if (data.questions.length === 0) {
        toast.error('未能识别到任何题目，请检查 PDF 文件');
      } else {
        toast.success(`识别到 ${data.questions.length} 道题目`);
        setStep('preview');
      }
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'TimeoutError'
        ? '请求超时，请重试'
        : `处理失败: ${err instanceof Error ? err.message : '请重试'}`;
      toast.error(msg);
      console.error(err);
    } finally {
      setIsProcessing(false);
      setProgressStage('');
      setProgressDetail('');
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
        <h1 className="text-2xl font-bold">PDF 错题导入</h1>
      </div>

      {step === 'upload' ? (
        <UploadStep
          onFileSelected={handleFileSelected}
          isProcessing={isProcessing}
          progressStage={progressStage}
          progressDetail={progressDetail}
        />
      ) : (
        <PreviewStep
          questions={questions}
          warnings={warnings}
          folders={folders}
          onConfirm={handleConfirm}
          onBack={() => setStep('upload')}
          isImporting={isImporting}
        />
      )}
    </div>
  );
}
