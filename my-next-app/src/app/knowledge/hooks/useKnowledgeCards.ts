'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { KnowledgeCard } from '@/lib/services/knowledge';

export function useKnowledgeCards() {
    const [cards, setCards] = useState<KnowledgeCard[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [stats, setStats] = useState<{ total: number; byCategory: { category: string; count: number }[] }>({ total: 0, byCategory: [] });
    const [loading, setLoading] = useState(true);
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

    const loadCards = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedCategory) params.set('category', selectedCategory);

            const response = await fetch(`/api/knowledge/cards?${params.toString()}`);
            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            setCards(data.cards || []);
            setCategories(data.categories || []);
            setStats(data.stats || { total: 0, byCategory: [] });
        } catch (error) {
            console.error('[useKnowledgeCards] 加载失败:', error);
            showToast('加载失败，请检查网络', 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedCategory, showToast]);

    useEffect(() => {
        loadCards();
    }, [loadCards]);

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

    const handleDelete = async (id: number) => {
        if (!confirm('确定删除这张知识卡片吗？')) return;
        try {
            const resp = await fetch(`/api/knowledge/cards/${id}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error('删除失败');
            setCards(prev => prev.filter(c => c.id !== id));
            showToast('已删除知识卡片');
            loadCards(); // 刷新统计
        } catch (error) {
            console.error('删除失败:', error);
            showToast('删除失败', 'error');
        }
    };

    const handleSave = async () => {
        if (!editingCard) return;
        try {
            const isUpdate = !!editingCard.id;
            const url = isUpdate ? `/api/knowledge/cards/${editingCard.id}` : `/api/knowledge/cards`;
            const method = isUpdate ? 'PUT' : 'POST';

            const resp = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingCard),
            });
            if (!resp.ok) throw new Error('保存失败');

            showToast(isUpdate ? '卡片更新成功' : '卡片创建成功');
            setEditingCard(null);
            setIsCreateModal(false);
            loadCards();
        } catch (error) {
            console.error('保存失败:', error);
            showToast('保存失败', 'error');
        }
    };

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
