"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
    getAiConfigsAction,
    saveAiConfigAction,
    deleteAiConfigAction,
    setActiveAiConfigAction,
    AiConfig
} from '@/server/actions/config';
import { testAiConnectionAction } from '@/server/actions/settings';
import { ConfigList } from './ConfigList';
import { ConfigForm } from './ConfigForm';
import { QuickAddModals } from './QuickAddModals';

export function ConfigManager() {
    const [configs, setConfigs] = useState<AiConfig[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isZjuAdding, setIsZjuAdding] = useState(false);
    const [isSiliconAdding, setIsSiliconAdding] = useState(false);
    const [currentConfig, setCurrentConfig] = useState<Partial<AiConfig>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await getAiConfigsAction();
            setConfigs(data);
        } catch (_e) {
            toast.error("配置加载失败");
        }
    };

    const handleStartEdit = (config?: AiConfig) => {
        if (config) {
            setCurrentConfig({ ...config });
        } else {
            setCurrentConfig({
                name: "新配置",
                api_url: "https://api.openai.com/v1",
                api_key: "",
                model_economy: "gpt-4o-mini",
                model_premium: "gpt-4o",
                is_active: false
            });
        }
        setIsEditing(true);
        setIsZjuAdding(false);
        setIsSiliconAdding(false);
    };

    const handleStartZjuAdd = () => {
        setCurrentConfig({
            name: "浙大 DeepSeek",
            api_url: "https://chat.zju.edu.cn/api/ai/v1",
            api_key: "",
            model_economy: "deepseek-v3",
            model_premium: "deepseek-v3",
            is_active: false
        });
        setIsZjuAdding(true);
        setIsSiliconAdding(false);
        setIsEditing(false);
    };

    const handleStartSiliconAdd = () => {
        setCurrentConfig({
            name: "硅基流动 DeepSeek",
            api_url: "https://api.siliconflow.cn/v1",
            api_key: "",
            model_economy: "deepseek-ai/DeepSeek-V3",
            model_premium: "deepseek-ai/DeepSeek-R1",
            is_active: false
        });
        setIsSiliconAdding(true);
        setIsZjuAdding(false);
        setIsEditing(false);
    };

    const handleSaveConfig = async (configOverride?: Partial<AiConfig>) => {
        const configToSave = configOverride || currentConfig;
        if (!configToSave.name || !configToSave.api_url || !configToSave.api_key) {
            toast.error("请填写必填项 (名称, URL, Key)");
            return;
        }
        setIsSaving(true);
        try {
            const res = await saveAiConfigAction(configToSave);
            if (res.success) {
                toast.success("配置已保存");
                setIsEditing(false);
                setIsZjuAdding(false);
                setIsSiliconAdding(false);
                loadSettings();
            } else {
                toast.error("保存失败: " + res.error);
            }
        } catch (_e) {
            toast.error("请求失败");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteConfig = async (id: number) => {
        if (!confirm("确定要删除此配置吗？")) return;
        try {
            const res = await deleteAiConfigAction(id);
            if (res.success) {
                toast.success("删除成功");
                loadSettings();
            } else {
                toast.error(res.error || "删除失败");
            }
        } catch (_e) {
            toast.error("操作失败");
        }
    };

    const handleActivateConfig = async (id: number) => {
        try {
            await setActiveAiConfigAction(id);
            toast.success("已切换激活配置");
            loadSettings();
        } catch (_e) {
            toast.error("切换失败");
        }
    };

    const handleTestConnection = async (config: Partial<AiConfig>) => {
        if (!config.api_key || !config.api_url) {
            toast.error("请先填写配置信息");
            return;
        }
        setIsTesting(true);
        try {
            const res = await testAiConnectionAction(
                config.api_key,
                config.api_url,
                config.model_economy || 'gpt-4o-mini'
            );
            if (res.success) {
                toast.success(`连接成功！AI 响应: ${res.message}`);
            } else {
                toast.error(`连接失败: ${res.error}`);
            }
        } catch (_e) {
            toast.error("测试请求发送失败");
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            {/* List View */}
            {!isEditing && !isZjuAdding && !isSiliconAdding && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card p-6 rounded-xl shadow-sm border border-border gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-foreground flex items-center">
                                <Zap className="w-5 h-5 mr-2 text-yellow-500" />
                                配置列表
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">管理多个 AI 服务商配置，点击“激活”以切换当前使用的服务。</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => handleStartEdit()}>
                                <Plus className="w-4 h-4 mr-2" />
                                新建配置
                            </Button>
                            <Button size="sm" onClick={() => handleStartZjuAdd()} variant="secondary">
                                <Zap className="w-4 h-4 mr-2" />
                                浙大模型
                            </Button>
                            <Button size="sm" onClick={() => handleStartSiliconAdd()} variant="outline" className="border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10">
                                <Zap className="w-4 h-4 mr-2" />
                                硅基流动
                            </Button>
                        </div>
                    </div>

                    <ConfigList
                        configs={configs}
                        onEdit={handleStartEdit}
                        onDelete={handleDeleteConfig}
                        onActivate={handleActivateConfig}
                    />

                    {/* Connectivity Tests (Simplified for this view) */}
                    <div className="mt-8 pt-6 border-t border-dashed border-border">
                        <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">连通性快速检查 (当前激活)</h3>
                        <div className="flex gap-4">
                            <Button size="sm" variant="ghost" onClick={async () => {
                                const id = toast.loading("测试纠偏生成...");
                                try {
                                    const { generateCorrectionQuizAction } = await import('@/server/actions/ai');
                                    await generateCorrectionQuizAction("Test", "Wrong", "Correct");
                                    toast.success("纠偏功能正常", { id });
                                } catch (e: unknown) { toast.error("失败: " + e.message, { id }); }
                            }}>纠偏测试</Button>
                            <Button size="sm" variant="ghost" onClick={async () => {
                                const id = toast.loading("测试回归生成...");
                                try {
                                    const { generateRegressionChallengeAction } = await import('@/server/actions/ai');
                                    await generateRegressionChallengeAction("Test", ["tag1"]);
                                    toast.success("回归功能正常", { id });
                                } catch (e: unknown) { toast.error("失败: " + e.message, { id }); }
                            }}>回归测试</Button>
                        </div>
                    </div>
                </div>
            )}

            {isEditing && (
                <ConfigForm
                    config={currentConfig}
                    isSaving={isSaving}
                    isTesting={isTesting}
                    onSave={handleSaveConfig}
                    onCancel={() => setIsEditing(false)}
                    onTest={handleTestConnection}
                    onChange={setCurrentConfig}
                />
            )}

            <QuickAddModals
                currentConfig={currentConfig}
                isZjuAdding={isZjuAdding}
                isSiliconAdding={isSiliconAdding}
                isSaving={isSaving}
                onClose={() => { setIsZjuAdding(false); setIsSiliconAdding(false); }}
                onSave={handleSaveConfig}
                onChange={setCurrentConfig}
            />
        </div>
    );
}
