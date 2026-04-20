'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { KnowledgeCard } from '@/lib/services/knowledge';
import { fetchJson } from '@/lib/utils/api-client';

/** React Query 的 Query Key 常量 */
const KNOWLEDGE_CARDS_KEY = 'knowledge-cards';

/**
 * 知识卡片的数据获取与操作 Hook（React Query 版本）。
 * 利用 useQuery 自动缓存卡片列表，useMutation 处理增删改后自动刷新。
 */
export function useKnowledgeCards() {
    const queryClient = useQueryClient();
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingCard, setEditingCard] = useState<Partial<KnowledgeCard> | null>(null);
    const [isCreateModal, setIsCreateModal] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ---- 查询：使用 useQuery 自动缓存 ----
    const { data, isLoading: loading } = useQuery({
        queryKey: [KNOWLEDGE_CARDS_KEY, selectedCategory],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (selectedCategory) params.set('category', selectedCategory);
            return fetchJson<{
                cards: KnowledgeCard[];
                categories: string[];
                stats: { total: number; byCategory: { category: string; count: number }[] };
            }>(`/api/knowledge/cards?${params.toString()}`);
        },
    });

    const cards = useMemo(() => data?.cards ?? [], [data?.cards]);
    const categories = data?.categories ?? [];
    const stats = data?.stats ?? { total: 0, byCategory: [] };

    // ---- 客户端搜索过滤 ----
    const filteredCards = useMemo(() => {
        if (!cards) return [];
        return cards.filter(card => {
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            const titleMatch = (card.title || '').toLowerCase().includes(query);
            const frontMatch = (card.front || '').toLowerCase().includes(query);
            const backMatch = (card.back || '').toLowerCase().includes(query);
            const tagMatch = Array.isArray(card.tags) && card.tags.some(t => String(t).toLowerCase().includes(query));
            return titleMatch || frontMatch || backMatch || tagMatch;
        });
    }, [cards, searchQuery]);

    // ---- 删除：useMutation + 自动刷新 ----
    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const resp = await fetch(`/api/knowledge/cards/${id}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error('删除失败');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [KNOWLEDGE_CARDS_KEY] });
            showToast('已删除知识卡片');
        },
        onError: (error) => {
            console.error('删除失败:', error);
            showToast('删除失败', 'error');
        },
    });

    const handleDelete = async (id: number) => {
        if (!confirm('确定删除这张知识卡片吗？')) return;
        deleteMutation.mutate(id);
    };

    // ---- 保存（创建/更新）：useMutation + 自动刷新 ----
    const saveMutation = useMutation({
        mutationFn: async (card: Partial<KnowledgeCard>) => {
            const isUpdate = !!card.id;
            const url = isUpdate ? `/api/knowledge/cards/${card.id}` : `/api/knowledge/cards`;
            const method = isUpdate ? 'PUT' : 'POST';

            const resp = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(card),
            });
            if (!resp.ok) throw new Error('保存失败');
        },
        onSuccess: (_, card) => {
            const isUpdate = !!card.id;
            showToast(isUpdate ? '卡片更新成功' : '卡片创建成功');
            setEditingCard(null);
            setIsCreateModal(false);
            queryClient.invalidateQueries({ queryKey: [KNOWLEDGE_CARDS_KEY] });
        },
        onError: (error) => {
            console.error('保存失败:', error);
            showToast('保存失败', 'error');
        },
    });

    const handleSave = async () => {
        if (!editingCard) return;
        saveMutation.mutate(editingCard);
    };

    // ---- 导出（保持原逻辑，非缓存相关） ----
    const handleExport = async () => {
        setExporting(true);
        try {
            const params = new URLSearchParams();
            params.set('format', 'anki');
            if (selectedCategory) params.set('category', selectedCategory);

            const response = await fetch(`/api/knowledge/cards?${params.toString()}`);
            if (!response.ok) throw new Error('导出失败');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `knowledge_cards_${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            showToast('导出成功！已保存为 Anki 格式');
        } catch (error) {
            console.error('导出失败:', error);
            showToast('导出失败，请重试', 'error');
        } finally {
            setExporting(false);
        }
    };

    // 提供给外部手动刷新的方法（完全兼容原有 API）
    const loadCards = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: [KNOWLEDGE_CARDS_KEY] });
    }, [queryClient]);

    return {
        cards,
        filteredCards,
        categories,
        stats,
        loading,
        selectedCategory,
        setSelectedCategory,
        searchQuery,
        setSearchQuery,
        editingCard,
        setEditingCard,
        isCreateModal,
        setIsCreateModal,
        exporting,
        toast,
        handleDelete,
        handleSave,
        handleExport,
        loadCards
    };
}
