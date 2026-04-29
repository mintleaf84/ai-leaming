'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { toggleGlobalFeatureFlag, getGlobalFeatureFlag } from '@/server/actions/feature-flags';

interface FeatureFlag {
    key: string;
    label: string;
    description: string;
    defaultEnabled: boolean;
    colorClass: string;
}

const FEATURE_FLAGS: FeatureFlag[] = [
    {
        key: 'ENABLE_INTELLIGENT_REVIEW',
        label: '强制打断与复盘机制 (Intelligent Review)',
        description: '【练习页降级保护】：当关闭时，前端会短路状态机，屏蔽由于错题积攒触发的强制复盘（知识点研读、变式、盲区等界面），让学员专注于连续刷题，直接进入成绩结算。适用于路演或希望练习流畅度优先的场景。',
        defaultEnabled: false,
        colorClass: 'bg-purple-600 hover:bg-purple-700',
    },
    {
        key: 'ENABLE_CULTIVATION',
        label: '修仙中心 (Cultivation Center)',
        description: '【趣味模块管理】：控制仪表盘底部的"修仙中心"入口卡片。关闭后，该模块将对所有用户隐藏，且直接访问相关页面将被跳回首页。适用于需要保持学术严肃性或临时下线内容的场景。',
        defaultEnabled: false,
        colorClass: 'bg-emerald-600 hover:bg-emerald-700',
    },
    {
        key: 'ENABLE_TEXTBOOK',
        label: '教材库 (Textbook Library)',
        description: '【核心资源管理】：控制侧边栏及仪表盘的"教材库"入口。关闭后，教材上传、目录解析及 AI 辅助阅读功能将不可用，已有教材数据将被安全隐藏。',
        defaultEnabled: true,
        colorClass: 'bg-blue-600 hover:bg-blue-700',
    },
    {
        key: 'ENABLE_NOTES',
        label: '智能笔记 (Smart Notes)',
        description: '【学习辅助工具】：控制全站笔记功能。关闭后，笔记列表、编辑器及题目引用标注功能将被隐藏。',
        defaultEnabled: true,
        colorClass: 'bg-amber-600 hover:bg-amber-700',
    },
    {
        key: 'ENABLE_OCR_MINDMAP',
        label: '思维导图工作台 (OCR Mindmap)',
        description: '【AI 辅助工具】：控制文字识别页的"转为导图"功能及笔记页的思维导图视图。关闭后，相关入口将隐藏，已生成的导图数据不受影响。',
        defaultEnabled: true,
        colorClass: 'bg-rose-600 hover:bg-rose-700',
    },
];

export function FeatureFlagsPanel() {
    const [flags, setFlags] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const loadFlags = async () => {
            const entries = await Promise.all(
                FEATURE_FLAGS.map(async (f) => {
                    const value = await getGlobalFeatureFlag(f.key, f.defaultEnabled);
                    return [f.key, value] as const;
                })
            );
            setFlags(Object.fromEntries(entries));
        };
        loadFlags();
    }, []);

    const handleToggle = async (flag: FeatureFlag) => {
        const current = flags[flag.key] ?? flag.defaultEnabled;
        const newVal = !current;
        const res = await toggleGlobalFeatureFlag(flag.key, newVal);
        if (res.success) {
            setFlags(prev => ({ ...prev, [flag.key]: newVal }));
            toast.success(newVal ? `${flag.label} 已开启` : `${flag.label} 已关闭`);
        } else {
            toast.error(res.error || '切换失败');
        }
    };

    return (
        <Card className="md:col-span-7 border-purple-200 shadow-sm">
            <CardHeader className="bg-purple-50/50">
                <CardTitle className="flex items-center gap-2 text-purple-700">
                    <Sparkles className="w-5 h-5" />
                    核心功能实验场 (Feature Flags)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
                {FEATURE_FLAGS.map((flag) => {
                    const enabled = flags[flag.key] ?? flag.defaultEnabled;
                    return (
                        <div key={flag.key} className="flex items-center justify-between p-4 border rounded-lg bg-card">
                            <div>
                                <h4 className="font-semibold mb-1">{flag.label}</h4>
                                <p className="text-sm text-muted-foreground max-w-3xl">
                                    {flag.description}
                                </p>
                            </div>
                            <Button
                                variant={enabled ? "default" : "outline"}
                                onClick={() => handleToggle(flag)}
                                className={enabled ? flag.colorClass : ""}
                            >
                                {enabled ? '已开启' : '已关闭'}
                            </Button>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
