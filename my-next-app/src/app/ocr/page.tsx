'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, Image as ImageIcon, Loader2, Copy, Check, Download, X, ScanLine, ChevronDown, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { performOcrAction, getOcrModelsAction } from '@/server/actions/ocr';
import { generateMindmapAction } from '@/server/actions/mindmap';
import { getGlobalFeatureFlag } from '@/server/actions/feature-flags';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import dynamic from 'next/dynamic';

const SimpleMindMapViewer = dynamic(
    () => import('@/components/ocr/SimpleMindMapViewer').then(mod => mod.SimpleMindMapViewer),
    { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center text-muted-foreground animate-pulse">引擎装载中...</div> }
);
import type { OcrModel, OcrModelInfo } from '@/types/ocr';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// 支持的文件类型
const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.webp,.bmp';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function OcrPage() {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 模型选择
    const [models, setModels] = useState<OcrModelInfo[]>([]);
    const [selectedModel, setSelectedModel] = useState<OcrModel>('paddle-ocr');
    const [showModelMenu, setShowModelMenu] = useState(false);
    const modelMenuRef = useRef<HTMLDivElement>(null);

    // 思维导图状态
    const [mindmapMarkdown, setMindmapMarkdown] = useState<string | null>(null);
    const [isGeneratingMindmap, setIsGeneratingMindmap] = useState(false);
    const [showMindmapDialog, setShowMindmapDialog] = useState(false);
    const [mindmapEnabled, setMindmapEnabled] = useState(true);

    // 加载模型列表和功能开关
    useEffect(() => {
        getOcrModelsAction().then((result) => {
            if (result.data) setModels(result.data);
        });
        getGlobalFeatureFlag('ENABLE_OCR_MINDMAP', true).then(setMindmapEnabled);
    }, []);

    // 点击外部关闭模型菜单
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
                setShowModelMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const currentModel = models.find(m => m.id === selectedModel);

    // 检查当前文件是否被选中的模型支持
    const isFileSupported = useCallback((f: File | null, model: OcrModel) => {
        if (!f) return true;
        const m = models.find(x => x.id === model);
        if (!m) return true;
        return m.supportedTypes.includes(f.type);
    }, [models]);

    // 处理文件选择
    const handleFile = useCallback((selectedFile: File) => {
        const allTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/bmp'];
        if (!allTypes.includes(selectedFile.type)) {
            toast.error('不支持的文件类型，请上传 PDF 或图片文件');
            return;
        }
        if (selectedFile.size > MAX_FILE_SIZE) {
            toast.error('文件过大，请上传 10MB 以内的文件');
            return;
        }

        setFile(selectedFile);
        setResult(null);

        // 图片文件生成预览
        if (selectedFile.type.startsWith('image/')) {
            const url = URL.createObjectURL(selectedFile);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }

        // 如果当前模型不支持此文件类型，自动切换到 PaddleOCR
        if (!isFileSupported(selectedFile, selectedModel)) {
            setSelectedModel('paddle-ocr');
            toast.info('已自动切换为 PaddleOCR（当前模型不支持此文件类型）');
        }
    }, [selectedModel, isFileSupported]);

    // 拖拽事件
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) handleFile(droppedFile);
    }, [handleFile]);

    // 点击上传
    const handleClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) handleFile(selectedFile);
    }, [handleFile]);

    // 开始 OCR 识别
    const handleRecognize = useCallback(async () => {
        if (!file) return;

        setIsProcessing(true);
        setResult(null);

        try {
            // 将文件转为 Base64
            const buffer = await file.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            const result = await performOcrAction({ 
                fileBase64: base64, 
                fileName: file.name, 
                mimeType: file.type, 
                model: selectedModel 
            });

            if (result.data?.success && result.data.text) {
                setResult(result.data.text);
                toast.success('识别完成');
            } else {
                toast.error(result.serverError || '识别失败');
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : '识别过程中发生错误');
        } finally {
            setIsProcessing(false);
        }
    }, [file, selectedModel]);

    // 复制结果
    const handleCopy = useCallback(async () => {
        if (!result) return;
        await navigator.clipboard.writeText(result);
        setCopied(true);
        toast.success('已复制到剪贴板');
        setTimeout(() => setCopied(false), 2000);
    }, [result]);

    // 生成思维导图
    const handleGenerateMindmap = useCallback(async () => {
        if (!result) return;
        
        setIsGeneratingMindmap(true);
        try {
            const res = await generateMindmapAction(result);
            if (res.success && res.data) {
                setMindmapMarkdown(res.data);
                setShowMindmapDialog(true);
            } else {
                toast.error(res.error || '生成思维导图失败');
            }
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : '生成过程中发生错误');
        } finally {
            setIsGeneratingMindmap(false);
        }
    }, [result]);

    // 下载为 Markdown
    const handleDownload = useCallback(() => {
        if (!result) return;
        const blob = new Blob([result], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const baseName = file?.name.replace(/\.[^/.]+$/, '') || 'ocr_result';
        a.href = url;
        a.download = `${baseName}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }, [result, file]);

    // 清除文件
    const handleClear = useCallback(() => {
        setFile(null);
        setPreviewUrl(null);
        setResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    // 切换模型
    const handleSelectModel = useCallback((modelId: OcrModel) => {
        // 检查当前文件是否兼容
        if (file && !isFileSupported(file, modelId)) {
            toast.warning('当前文件类型不被该模型支持，请更换文件或选择其他模型');
            return;
        }
        setSelectedModel(modelId);
        setShowModelMenu(false);
    }, [file, isFileSupported]);

    return (
        <div className="min-h-[calc(100vh-64px)] bg-background p-6 md:p-12 font-sans">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* 页面标题 */}
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <ScanLine className="w-8 h-8 text-primary" />
                            文字识别 (OCR)
                        </h1>
                        <p className="text-muted-foreground mt-2">
                            上传图片或 PDF 文件，智能识别文字内容并转为 Markdown 格式。
                        </p>
                    </div>

                    {/* 模型选择器 */}
                    <div className="relative" ref={modelMenuRef}>
                        <Button
                            variant="outline"
                            onClick={() => setShowModelMenu(!showModelMenu)}
                            className="h-10 px-4 gap-2 rounded-xl"
                        >
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <span className="text-sm font-medium">{currentModel?.name || '选择模型'}</span>
                            <ChevronDown className={cn(
                                "w-4 h-4 text-muted-foreground transition-transform",
                                showModelMenu && "rotate-180"
                            )} />
                        </Button>

                        {showModelMenu && (
                            <div className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                {models.map((m) => {
                                    const supported = isFileSupported(file, m.id);
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => handleSelectModel(m.id)}
                                            disabled={!supported}
                                            className={cn(
                                                "w-full text-left px-4 py-3 transition-colors border-b border-border last:border-b-0",
                                                selectedModel === m.id
                                                    ? "bg-primary/10"
                                                    : supported
                                                        ? "hover:bg-accent"
                                                        : "opacity-50 cursor-not-allowed"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-3 h-3 rounded-full border-2 flex-shrink-0",
                                                    selectedModel === m.id
                                                        ? "border-primary bg-primary"
                                                        : "border-muted-foreground"
                                                )} />
                                                <div>
                                                    <div className="font-medium text-sm text-foreground">
                                                        {m.name}
                                                        {!supported && (
                                                            <span className="ml-2 text-xs text-destructive">
                                                                (不支持当前文件类型)
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                        {m.description}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* 上传区域 */}
                {!file ? (
                    <div
                        onClick={handleClick}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                            "relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300",
                            "hover:border-primary/50 hover:bg-primary/5",
                            isDragging
                                ? "border-primary bg-primary/10 scale-[1.02]"
                                : "border-border bg-muted/20"
                        )}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPTED_EXTENSIONS}
                            onChange={handleInputChange}
                            className="hidden"
                        />
                        <div className="flex flex-col items-center gap-4">
                            <div className={cn(
                                "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
                                isDragging ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                                <Upload className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-lg font-medium text-foreground">
                                    拖拽文件到这里，或点击上传
                                </p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    支持 PDF、PNG、JPG、WebP、BMP，最大 10MB
                                </p>
                            </div>
                            <div className="flex gap-3 mt-2">
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs text-muted-foreground">
                                    <FileText className="w-3.5 h-3.5" /> PDF
                                </div>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs text-muted-foreground">
                                    <ImageIcon className="w-3.5 h-3.5" /> 图片
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* 文件已选择：预览 + 操作 */
                    <Card className="border border-border rounded-2xl overflow-hidden">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                        {file.type === 'application/pdf'
                                            ? <FileText className="w-5 h-5" />
                                            : <ImageIcon className="w-5 h-5" />
                                        }
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm text-foreground truncate max-w-[300px]">
                                            {file.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {(file.size / 1024).toFixed(1)} KB · 使用 {currentModel?.name || selectedModel}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleClear}
                                    className="text-muted-foreground hover:text-destructive"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* 图片预览 */}
                            {previewUrl && (
                                <div className="mb-4 rounded-xl overflow-hidden border border-border bg-muted/30 max-h-[400px] flex items-center justify-center">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={previewUrl}
                                        alt="预览"
                                        className="max-h-[400px] object-contain"
                                    />
                                </div>
                            )}

                            {/* 识别按钮 */}
                            <Button
                                onClick={handleRecognize}
                                disabled={isProcessing}
                                className="w-full h-12 text-base rounded-xl"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        正在识别中，请稍候...
                                    </>
                                ) : (
                                    <>
                                        <ScanLine className="w-5 h-5 mr-2" />
                                        开始识别
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* 识别结果 */}
                {result && (
                    <Card className="border border-border rounded-2xl overflow-hidden">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-primary" />
                                    识别结果
                                </h2>
                                <div className="flex gap-2">
                                    {mindmapEnabled && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleGenerateMindmap}
                                        disabled={isGeneratingMindmap}
                                        className="h-8"
                                    >
                                        {isGeneratingMindmap ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Network className="w-3.5 h-3.5 mr-1.5 text-primary" />}
                                        <span className={isGeneratingMindmap ? "" : "text-primary font-medium"}>
                                            转为导图
                                        </span>
                                    </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleCopy}
                                        className="h-8"
                                    >
                                        {copied
                                            ? <><Check className="w-3.5 h-3.5 mr-1.5" /> 已复制</>
                                            : <><Copy className="w-3.5 h-3.5 mr-1.5" /> 复制</>
                                        }
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleDownload}
                                        className="h-8"
                                    >
                                        <Download className="w-3.5 h-3.5 mr-1.5" /> 下载 .md
                                    </Button>
                                </div>
                            </div>
                            <div className="bg-muted/30 rounded-xl p-4 border border-border max-h-[600px] overflow-y-auto">
                                <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
                                    {result}
                                </pre>
                            </div>
                            <p className="text-xs text-muted-foreground mt-3 text-right">
                                共 {result.length} 字符 · {currentModel?.name}
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* 思维导图弹窗 */}
                <Dialog open={showMindmapDialog} onOpenChange={setShowMindmapDialog}>
                    <DialogContent className="max-w-[90vw] w-[1200px] h-[85vh] flex flex-col p-6">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                <Network className="w-5 h-5 text-primary" />
                                结构化思维导图
                            </DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 mt-4 overflow-hidden rounded-xl border border-border bg-background">
                            {mindmapMarkdown && (
                                <SimpleMindMapViewer 
                                    markdown={mindmapMarkdown} 
                                    onChange={setMindmapMarkdown}
                                    className="w-full h-full"
                                />
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
