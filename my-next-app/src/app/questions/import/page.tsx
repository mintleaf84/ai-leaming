'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UploadStep } from './components/UploadStep';
import { PreviewStep } from './components/PreviewStep';
import { previewPdfImportAction, confirmPdfImportAction, getImportFoldersAction } from '@/server/actions/pdf-import';
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
  const [fileBase64, setFileBase64] = useState('');
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    getImportFoldersAction().then((result) => {
      if (result.data) setFolders(result.data);
    });
  }, []);

  const handleFileSelected = useCallback(async (base64: string, name: string) => {
    setFileBase64(base64);
    setFileName(name);
    setIsProcessing(true);
    setProgressStage('ocr');
    setProgressDetail('正在 OCR 识别...');

    try {
      // 模拟进度更新（服务端无法实时推送进度）
      setTimeout(() => {
        setProgressStage('ai_parse');
        setProgressDetail('AI 智能解析中...');
      }, 3000);

      const result = await previewPdfImportAction({
        fileBase64: base64,
        fileName: name,
        mimeType: 'application/pdf',
      });

      if (result.data) {
        setQuestions(result.data.questions);
        setWarnings(result.data.parseWarnings);
        if (result.data.questions.length === 0) {
          toast.error('未能识别到任何题目，请检查 PDF 文件');
        } else {
          toast.success(`识别到 ${result.data.questions.length} 道题目`);
          setStep('preview');
        }
      } else if (result.serverError) {
        toast.error(`解析失败: ${result.serverError}`);
      }
    } catch (err) {
      toast.error('处理失败，请重试');
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
      const result = await confirmPdfImportAction({
        questions: finalQuestions,
        folderId,
        addToWrongBook: addToWrongBook ?? true,
      });

      if (result.data?.success) {
        toast.success(result.data.message);
        setStep('upload');
        setQuestions([]);
        setWarnings([]);
      } else {
        toast.error(result.data?.message || '导入失败');
      }
    } catch (err) {
      toast.error('导入失败，请重试');
      console.error(err);
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
