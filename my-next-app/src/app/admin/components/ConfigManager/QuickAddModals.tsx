"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Zap, X, Save } from 'lucide-react';
import type { AiConfig } from '@/lib/services/ai-config';

interface QuickAddModalsProps {
    currentConfig: Partial<AiConfig>;
    isZjuAdding: boolean;
    isSiliconAdding: boolean;
    isSaving: boolean;
    onClose: () => void;
    onSave: (config: Partial<AiConfig>) => void;
    onChange: (config: Partial<AiConfig>) => void;
}

export function QuickAddModals({
    currentConfig,
    isZjuAdding,
    isSiliconAdding,
    isSaving,
    onClose,
    onSave,
    onChange
}: QuickAddModalsProps) {
    if (!isZjuAdding && !isSiliconAdding) return null;

    if (isZjuAdding) {
        return (
            <div className="bg-card rounded-xl shadow-lg border border-border p-8 max-w-lg mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-600 text-white p-2 rounded-lg">
                            <Zap className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">浙大模型快速接入</h2>
                            <p className="text-xs text-muted-foreground">已预设 DeepSeek-V3 接口地址与模型参数</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div className="bg-blue-500/10 p-4 rounded-lg text-sm text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        <p className="font-bold mb-1">预设信息：</p>
                        <p>URL: <span className="font-mono">https://chat.zju.edu.cn/api/ai/v1</span></p>
                        <p>Model: <span className="font-mono">deepseek-v3</span></p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">API Key (必填)</label>
                        <input
                            type="password"
                            value={currentConfig.api_key || ''}
                            onChange={(e) => onChange({ ...currentConfig, api_key: e.target.value })}
                            className="w-full p-3 border border-border bg-background rounded-lg focus:ring-2 focus:ring-primary outline-none text-lg"
                            placeholder="请输入您的浙大 API Key..."
                            autoFocus
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button variant="outline" onClick={onClose}>取消</Button>
                        <Button onClick={() => onSave(currentConfig)} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Save className="w-4 h-4 mr-2" />
                            保存并接入
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (isSiliconAdding) {
        return (
            <div className="bg-card rounded-xl shadow-lg border border-border p-8 max-w-lg mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <div className="bg-purple-600 text-white p-2 rounded-lg">
                            <Zap className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">硅基流动快速接入</h2>
                            <p className="text-xs text-muted-foreground">已预设 DeepSeek V3/R1 参数</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div className="bg-purple-500/10 p-4 rounded-lg text-sm text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        <p className="font-bold mb-1">预设信息：</p>
                        <p>URL: <span className="font-mono">https://api.siliconflow.cn/v1</span></p>
                        <p>Eco: <span className="font-mono">deepseek-ai/DeepSeek-V3</span></p>
                        <p>Pro: <span className="font-mono">deepseek-ai/DeepSeek-R1</span></p>
                        <p>Embedding: <span className="font-mono">BAAI/bge-large-zh-v1.5</span> (1024 维)</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">API Key (必填)</label>
                        <input
                            type="password"
                            value={currentConfig.api_key || ''}
                            onChange={(e) => onChange({ ...currentConfig, api_key: e.target.value })}
                            className="w-full p-3 border border-border bg-background rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-lg"
                            placeholder="sk-..."
                            autoFocus
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button variant="outline" onClick={onClose}>取消</Button>
                        <Button onClick={() => {
                            const finalConfig = {
                                ...currentConfig,
                                name: currentConfig.name || 'SiliconFlow',
                                api_url: 'https://api.siliconflow.cn/v1',
                                model_economy: 'deepseek-ai/DeepSeek-V3',
                                model_premium: 'deepseek-ai/DeepSeek-R1',
                                model_embedding: 'BAAI/bge-large-zh-v1.5',
                                embedding_dimensions: 1024
                            };
                            onChange(finalConfig);
                            onSave(finalConfig);
                        }} disabled={isSaving} className="bg-purple-600 hover:bg-purple-700 text-white">
                            <Save className="w-4 h-4 mr-2" />
                            保存并接入
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
