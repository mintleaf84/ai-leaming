'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Loader2, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/utils';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MIN_TEXT_LENGTH = 20;

interface UploadStepProps {
  onFileSelected: (file: File) => void;
  onTextSubmit: (text: string) => void;
  isProcessing: boolean;
  progressStage: string;
  progressDetail: string;
}

export function UploadStep({ onFileSelected, onTextSubmit, isProcessing, progressStage, progressDetail }: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
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

  const handleTextSubmit = useCallback(() => {
    const text = textInput.trim();
    if (text.length < MIN_TEXT_LENGTH) {
      toast.error(`文本内容过短，至少需要 ${MIN_TEXT_LENGTH} 个字符`);
      return;
    }
    onTextSubmit(text);
  }, [textInput, onTextSubmit]);

  const stageLabels: Record<string, string> = {
    ocr: 'OCR 文字识别中...',
    ai_parse: 'AI 智能解析中...',
  };

  return (
    <Tabs defaultValue="pdf" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="pdf" disabled={isProcessing}>PDF 上传</TabsTrigger>
        <TabsTrigger value="text" disabled={isProcessing}>手动粘贴</TabsTrigger>
      </TabsList>

      <TabsContent value="pdf">
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
      </TabsContent>

      <TabsContent value="text">
        <Card>
          <CardContent className="py-6 space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <ClipboardPaste className="h-5 w-5" />
              <p className="text-sm">将题目文本粘贴到下方，AI 将自动识别并解析题目</p>
            </div>
            <Textarea
              placeholder="粘贴题目文本..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={12}
              disabled={isProcessing}
              className="text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {textInput.trim().length} 字符
              </span>
              <Button
                onClick={handleTextSubmit}
                disabled={isProcessing || textInput.trim().length < MIN_TEXT_LENGTH}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    处理中...
                  </>
                ) : (
                  '开始解析'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
