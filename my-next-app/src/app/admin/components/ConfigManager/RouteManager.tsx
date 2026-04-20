"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Save, RefreshCw, Network } from 'lucide-react';
import { toast } from 'sonner';
import {
    getAiConfigsAction,
    getAiModelRoutesAction,
    saveAiModelRouteAction,
    AiConfig,
    AiModelRoute
} from '@/server/actions/config';

export function RouteManager() {
    const [configs, setConfigs] = useState<AiConfig[]>([]);
    const [routes, setRoutes] = useState<AiModelRoute[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const features = [
        { id: 'premium', name: '高级对话 (Premium)', desc: '用于深度解析、回归测试、复杂逻辑生成' },
        { id: 'economy', name: '经济对话 (Economy)', desc: '用于标题生成、简单纠偏、快速反馈' },
        { id: 'embedding', name: '向量嵌入 (Embedding)', desc: '用于知识库索引和检索匹配' },
        { id: 'rerank', name: '重排序 (Rerank)', desc: '用于检索后的二次精排，提升准确率' },
        { id: 'knowledge', name: '知识提取 (Knowledge)', desc: '用于从对话中自动提取和整理知识点' },
    ];

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [configsData, routesData] = await Promise.all([
                getAiConfigsAction(),
                getAiModelRoutesAction()
            ]);
            setConfigs(configsData);
            setRoutes(routesData);
        } catch (_e) {
            toast.error("加载路由配置失败");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRouteChange = (feature: string, field: 'config_id' | 'model_name', value: unknown) => {
        setRoutes(prev => {
            const existing = prev.find(r => r.feature === feature);
            if (existing) {
                return prev.map(r => r.feature === feature ? { ...r, [field]: value } : r);
            } else {
                return [...prev, { feature, config_id: field === 'config_id' ? value : 0, model_name: field === 'model_name' ? value : '' }];
            }
        });
    };

    const handleSaveRoute = async (feature: string) => {
        const route = routes.find(r => r.feature === feature);
        if (!route || !route.config_id) {
            toast.error("请先选择服务商");
            return;
        }

        setIsSaving(true);
        try {
            const res = await saveAiModelRouteAction(route);
            if (res.success) {
                toast.success(`${feature} 路由已更新`);
                loadData();
            } else {
                toast.error("保存失败");
            }
        } catch (_e) {
            toast.error("请求失败");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-card p-6 rounded-xl shadow-sm border border-border">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-foreground flex items-center">
                            <Network className="w-5 h-5 mr-2 text-blue-500" />
                            模型路由设置
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            为不同的系统功能分配特定的服务商和模型，实现多服务商混合负载。
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadData}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        刷新
                    </Button>
                </div>

                <div className="overflow-hidden border border-border rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                            <tr>
                                <th className="px-4 py-3">功能模块</th>
                                <th className="px-4 py-3">服务商 (Provider)</th>
                                <th className="px-4 py-3">模型名称 (Model)</th>
                                <th className="px-4 py-3 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {features.map(feat => {
                                const route = routes.find(r => r.feature === feat.id);
                                const _selectedConfig = configs.find(c => c.id === route?.config_id);

                                return (
                                    <tr key={feat.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-4">
                                            <div className="font-semibold text-foreground">{feat.name}</div>
                                            <div className="text-xs text-muted-foreground mt-0.5">{feat.desc}</div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <select
                                                className="w-full bg-background border border-border rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                                                value={route?.config_id || ''}
                                                onChange={(e) => {
                                                    const configId = Number(e.target.value);
                                                    handleRouteChange(feat.id, 'config_id', configId);
                                                    // 自动填入该服务商对应的默认模型
                                                    const config = configs.find(c => c.id === configId);
                                                    if (config) {
                                                        let defaultModel = '';
                                                        if (feat.id === 'premium') defaultModel = config.model_premium;
                                                        if (feat.id === 'economy') defaultModel = config.model_economy;
                                                        if (feat.id === 'embedding') defaultModel = config.model_embedding || '';
                                                        if (feat.id === 'rerank') defaultModel = config.model_rerank || '';
                                                        if (feat.id === 'knowledge') defaultModel = config.model_knowledge || '';
                                                        handleRouteChange(feat.id, 'model_name', defaultModel);
                                                    }
                                                }}
                                            >
                                                <option value="">未选择</option>
                                                {configs.map(c => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name} {c.is_active ? '(默认)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-4 py-4">
                                            <input
                                                type="text"
                                                className="w-full bg-background border border-border rounded px-2 py-1 focus:ring-1 focus:ring-primary outline-none"
                                                value={route?.model_name || ''}
                                                onChange={(e) => handleRouteChange(feat.id, 'model_name', e.target.value)}
                                                placeholder="模型标识符"
                                            />
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={isSaving}
                                                onClick={() => handleSaveRoute(feat.id)}
                                            >
                                                <Save className="w-4 h-4 text-primary" />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                    <h4 className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">路由优先级说明:</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        1. 如果特定的功能模块（如 Rerank）配置了路由，系统将优先使用该路由指向的服务商和模型。<br />
                        2. 如果路由未设置或服务商已失效，系统将回退到“模型配置”标签页中标记为“激活”的全局默认配置。<br />
                        3. 请确保为向量嵌入（Embedding）选择的路由模型与数据库中现存向量的维度（Dimensions）保持一致。
                    </p>
                </div>
            </div>
        </div>
    );
}
