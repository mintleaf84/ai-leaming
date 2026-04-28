"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Save, X } from 'lucide-react';
import type { AiConfig } from '@/lib/services/ai-config';

interface ConfigFormProps {
    config: Partial<AiConfig>;
    isSaving: boolean;
    isTesting: boolean;
    onSave: (config: Partial<AiConfig>) => void;
    onCancel: () => void;
    onTest: (config: Partial<AiConfig>) => void;
    onChange: (config: Partial<AiConfig>) => void;
}

export function ConfigForm({ config, isSaving, isTesting, onSave, onCancel, onTest, onChange }: ConfigFormProps) {
    return (
        <div className="bg-card rounded-xl shadow-lg border border-border p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-foreground">
                    {config.id ? "编辑配置" : "新建配置"}
                </h2>
                <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-foreground mb-1">配置名称 (Name)</label>
                    <input
                        type="text"
                        value={config.name || ''}
                        onChange={(e) => onChange({ ...config, name: e.target.value })}
                        className="w-full p-2 border border-border bg-background rounded focus:ring-2 focus:ring-primary outline-none"
                        placeholder="例如：OpenAI, DeepSeek..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-1">API Base URL</label>
                    <input
                        type="text"
                        value={config.api_url || ''}
                        onChange={(e) => onChange({ ...config, api_url: e.target.value })}
                        className="w-full p-2 border border-border bg-background rounded focus:ring-2 focus:ring-primary outline-none"
                        placeholder="https://api.openai.com/v1"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-foreground mb-1">API Key</label>
                    <input
                        type="password"
                        value={config.api_key || ''}
                        onChange={(e) => onChange({ ...config, api_key: e.target.value })}
                        className="w-full p-2 border border-border bg-background rounded focus:ring-2 focus:ring-primary outline-none"
                        placeholder="sk-..."
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">经济模型 (Economy)</label>
                        <input
                            type="text"
                            value={config.model_economy || ''}
                            onChange={(e) => onChange({ ...config, model_economy: e.target.value })}
                            className="w-full p-2 border border-border bg-background rounded focus:ring-2 focus:ring-primary outline-none"
                            placeholder="gpt-4o-mini"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">高级模型 (Premium)</label>
                        <input
                            type="text"
                            value={config.model_premium || ''}
                            onChange={(e) => onChange({ ...config, model_premium: e.target.value })}
                            className="w-full p-2 border border-border bg-background rounded focus:ring-2 focus:ring-primary outline-none"
                            placeholder="gpt-4o"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">向量模型 (Embedding)</label>
                        <input
                            type="text"
                            value={config.model_embedding || ''}
                            onChange={(e) => onChange({ ...config, model_embedding: e.target.value })}
                            className="w-full p-2 border border-border bg-background rounded focus:ring-2 focus:ring-primary outline-none"
                            placeholder="text-embedding-3-small"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">向量维度 (Dimensions)</label>
                        <input
                            type="number"
                            value={config.embedding_dimensions || ''}
                            onChange={(e) => onChange({ ...config, embedding_dimensions: parseInt(e.target.value) || 0 })}
                            className="w-full p-2 border border-border bg-background rounded focus:ring-2 focus:ring-primary outline-none"
                            placeholder="768"
                        />
                    </div>
                </div>

                <div className="pt-2">
                    <label className="block text-sm font-medium text-foreground mb-1">重排序模型 (Rerank)</label>
                    <input
                        type="text"
                        value={config.model_rerank || ''}
                        onChange={(e) => onChange({ ...config, model_rerank: e.target.value })}
                        className="w-full p-2 border border-border bg-background rounded focus:ring-2 focus:ring-primary outline-none"
                        placeholder="bge-reranker-v2-m3"
                    />
                    <p className="text-xs text-muted-foreground mt-1">用于检索后的二次排序，提升准确度（需 API 支持 /rerank）</p>
                </div>

                <div className="pt-2">
                    <label className="block text-sm font-medium text-foreground mb-1">知识提取模型 (Knowledge)</label>
                    <input
                        type="text"
                        value={config.model_knowledge || ''}
                        onChange={(e) => onChange({ ...config, model_knowledge: e.target.value })}
                        className="w-full p-2 border border-border bg-background rounded focus:ring-2 focus:ring-primary outline-none"
                        placeholder="deepseek-ai/DeepSeek-R1-0528-Qwen3-8B"
                    />
                    <p className="text-xs text-muted-foreground mt-1">用于从聊天内容中提取知识卡片</p>
                </div>

                <div className="pt-6 flex justify-between border-t border-border mt-4">
                    <Button variant="secondary" onClick={() => onTest(config)} disabled={isTesting}>
                        {isTesting ? "测试中..." : "测试连接"}
                    </Button>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={onCancel}>取消</Button>
                        <Button onClick={() => onSave(config)} disabled={isSaving}>
                            <Save className="w-4 h-4 mr-2" />
                            保存配置
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
