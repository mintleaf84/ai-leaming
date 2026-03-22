'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Key, Plus, Trash2, Copy, Check, Eye, EyeOff, ShieldCheck, ShieldOff, Loader2
} from 'lucide-react';
import {
    getApiKeysAction,
    createApiKeyAction,
    toggleApiKeyAction,
    deleteApiKeyAction,
    type ApiKeyView,
} from '@/server/actions/api-keys';

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKeyView[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newDescription, setNewDescription] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);
    // 新创建的密钥（仅显示一次）
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
    // 控制每行密钥的可见性
    const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
    // 已复制状态
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const fetchKeys = useCallback(async () => {
        setLoading(true);
        const data = await getApiKeysAction();
        setKeys(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchKeys();
    }, [fetchKeys]);

    // 创建新密钥
    const handleCreate = async () => {
        if (!newDescription.trim()) return;
        setCreating(true);
        const result = await createApiKeyAction(newDescription.trim());
        if (result.success && result.key) {
            setNewlyCreatedKey(result.key);
            setNewDescription('');
            setShowCreateForm(false);
            await fetchKeys();
        }
        setCreating(false);
    };

    // 切换开关
    const handleToggle = async (id: number, currentState: number) => {
        await toggleApiKeyAction(id, !currentState);
        await fetchKeys();
    };

    // 删除
    const handleDelete = async (id: number) => {
        if (!confirm('确定要永久删除这个 API Key 吗？删除后使用此密钥的外部服务将立即失效。')) return;
        await deleteApiKeyAction(id);
        await fetchKeys();
    };

    // 复制密钥
    const handleCopy = async (key: string, id: number) => {
        await navigator.clipboard.writeText(key);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // 脱敏显示
    const maskKey = (key: string) => {
        if (key.length <= 8) return '••••••••';
        return key.slice(0, 6) + '••••••••' + key.slice(-4);
    };

    const activeCount = keys.filter((k) => k.is_active).length;

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* 标题区域 */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Key className="w-6 h-6" />
                        API Key 管理
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        管理外部开放接口的访问密钥（当前 {activeCount} 个激活 / 共 {keys.length} 个）
                    </p>
                </div>
                <Button onClick={() => { setShowCreateForm(true); setNewlyCreatedKey(null); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    生成新密钥
                </Button>
            </div>

            {/* 新创建密钥提示 */}
            {newlyCreatedKey && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                        ✅ 密钥已生成！请立即复制并妥善保管，此密钥仅显示一次：
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white dark:bg-gray-900 px-3 py-2 rounded border text-sm font-mono break-all">
                            {newlyCreatedKey}
                        </code>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(newlyCreatedKey, -1)}
                        >
                            {copiedId === -1 ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
            )}

            {/* 创建表单 */}
            {showCreateForm && (
                <div className="border rounded-lg p-4 bg-card space-y-3">
                    <h3 className="font-medium">生成新的 API Key</h3>
                    <Input
                        placeholder="输入密钥用途描述，例如：Coze 智能体接入"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => setShowCreateForm(false)}>取消</Button>
                        <Button onClick={handleCreate} disabled={creating || !newDescription.trim()}>
                            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            生成
                        </Button>
                    </div>
                </div>
            )}

            {/* 密钥列表 */}
            {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    加载中...
                </div>
            ) : keys.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>暂无 API Key</p>
                    <p className="text-sm mt-1">点击上方"生成新密钥"按钮创建第一个</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {keys.map((apiKey) => {
                        const isVisible = visibleKeys.has(apiKey.id);
                        return (
                            <div
                                key={apiKey.id}
                                className={`border rounded-lg p-4 bg-card transition-colors ${
                                    !apiKey.is_active ? 'opacity-60' : ''
                                }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0 space-y-2">
                                        {/* 描述 + 状态 */}
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">
                                                {apiKey.description || '未命名密钥'}
                                            </span>
                                            {apiKey.is_active ? (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                    激活
                                                </span>
                                            ) : (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                                    已停用
                                                </span>
                                            )}
                                        </div>

                                        {/* 密钥显示 */}
                                        <div className="flex items-center gap-2">
                                            <code className="text-sm font-mono text-muted-foreground">
                                                {isVisible ? apiKey.key_string : maskKey(apiKey.key_string)}
                                            </code>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => {
                                                    const next = new Set(visibleKeys);
                                                    isVisible ? next.delete(apiKey.id) : next.add(apiKey.id);
                                                    setVisibleKeys(next);
                                                }}
                                            >
                                                {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => handleCopy(apiKey.key_string, apiKey.id)}
                                            >
                                                {copiedId === apiKey.id ? (
                                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                                ) : (
                                                    <Copy className="w-3.5 h-3.5" />
                                                )}
                                            </Button>
                                        </div>

                                        {/* 时间 */}
                                        <p className="text-xs text-muted-foreground">
                                            创建于 {new Date(apiKey.created_at).toLocaleString('zh-CN')}
                                        </p>
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title={apiKey.is_active ? '停用' : '激活'}
                                            onClick={() => handleToggle(apiKey.id, apiKey.is_active)}
                                        >
                                            {apiKey.is_active ? (
                                                <ShieldCheck className="w-4 h-4 text-green-600" />
                                            ) : (
                                                <ShieldOff className="w-4 h-4 text-muted-foreground" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title="删除"
                                            onClick={() => handleDelete(apiKey.id)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
