'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/utils';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface UploadStepProps {
  onFileSelected: (file: File) => void;
  isProcessing: boolean;
  progressStage: string;
  progressDetail: string;
}

export function UploadStep({ onFileSelected, isProcessing, progressStage, progressDetail }: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('请上传 PDF 文件');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('文件大小不能超过 50MB');
      return;
    }

    setFileName(file.name);
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const stageLabels: Record<string, string> = {
    ocr: 'OCR 文字识别中...',
    ai_parse: 'AI 智能解析中...',
  };

  return (
    <Card
      className={cn(
        'border-2 border-dashed transition-colors cursor-pointer',
        isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
        isProcessing && 'pointer-events-none opacity-70',
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isProcessing && fileInputRef.current?.click()}
    >
      <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileInput}
        />

        {isProcessing ? (
          <>
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-lg font-medium">{stageLabels[progressStage] || '处理中...'}</p>
              {progressDetail && (
                <p className="text-sm text-muted-foreground">{progressDetail}</p>
              )}
            </div>
          </>
        ) : fileName ? (
          <>
            <FileText className="h-12 w-12 text-green-500" />
            <p className="text-sm text-muted-foreground">{fileName}</p>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              重新选择
            </Button>
          </>
        ) : (
          <>
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div className="text-center space-y-1">
              <p className="text-lg font-medium">拖拽或点击上传 PDF</p>
              <p className="text-sm text-muted-foreground">支持扫描件 PDF，最大 50MB</p>
            </div>
            <Button variant="outline" size="sm">选择文件</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
