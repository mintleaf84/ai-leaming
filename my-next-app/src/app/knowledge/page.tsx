'use client';

import React, { useState } from 'react';
import { BookOpen, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { getCategoryColor } from '@/lib/utils/category-colors';

// Hooks
import { useKnowledgeCards } from './hooks/useKnowledgeCards';
import { useStudyMode } from './hooks/useStudyMode';

// Components
import { KnowledgeHeader } from './components/KnowledgeHeader';
import { KnowledgeCardItem } from './components/KnowledgeCardItem';
import { StudyModeOverlay } from './components/StudyModeOverlay';
import { KnowledgeModal } from './components/KnowledgeModal';
import { AIGenerateModal } from './components/AIGenerateModal';

export default function KnowledgePage() {
    const {
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
    } = useKnowledgeCards();

    // AI 生成弹窗状态
    const [showAIModal, setShowAIModal] = useState(false);

    // AI 生成保存处理
    const handleAISave = async (card: Partial<typeof filteredCards[number]>) => {
        try {
            const resp = await fetch('/api/knowledge/cards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(card),
            });
            if (!resp.ok) throw new Error('保存失败');
            loadCards(); // 刷新卡片列表
        } catch (error) {
            console.error('AI 生成保存失败:', error);
        }
    };

    const {
        studyMode,
        studyIndex,
        studyFlipped,
        toggleStudyFlip,
        startStudy,
        exitStudy,
        nextCard,
        prevCard
    } = useStudyMode(filteredCards);

    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());

    const toggleFlip = (id: number) => {
        setFlippedCards(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    // 获取分类对应的颜色 (保持逻辑一致)
    // 获取分类对应的颜色 (保持逻辑一致)
    // 逻辑已移至 src/lib/utils/category-colors.ts

    return (
        <div className="min-h-screen bg-background">
            <KnowledgeHeader
                stats={stats}
                categories={categories}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onAdd={() => {
                    setEditingCard({ title: '', category: '', tags: [], front: '', back: '', key_points: [] });
                    setIsCreateModal(true);
                }}
                onAIGenerate={() => setShowAIModal(true)}
                onStudy={startStudy}
                onExport={handleExport}
                exporting={exporting}
                filteredCount={filteredCards.length}
            />

            <main className="max-w-7xl mx-auto px-4 py-8 pb-32">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-10 h-10 animate-spin text-primary" />
                        <p className="mt-4 text-muted-foreground font-medium tracking-wide">加载知识库中...</p>
                    </div>
                ) : filteredCards.length === 0 ? (
                    <div className="text-center py-24 bg-card/40 backdrop-blur-sm rounded-3xl border-2 border-dashed border-border">
                        <div className="w-24 h-24 mx-auto mb-6 bg-muted rounded-full flex items-center justify-center shadow-inner">
                            <BookOpen className="w-12 h-12 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">未找到匹配的卡片</h3>
                        <p className="text-muted-foreground max-w-sm mx-auto">尝试改变搜索词或切换分类。</p>
                    </div>
                ) : (
                    <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                        {filteredCards.map((card, index) => (
                            <div 
                                key={card.id} 
                                className={`animate-fade-in-up ${index < 5 ? `stagger-${index + 1}` : ''}`}
                            >
                                <KnowledgeCardItem
                                    card={card}
                                    isFlipped={flippedCards.has(card.id!)}
                                    onFlip={toggleFlip}
                                    onEdit={setEditingCard}
                                    onDelete={handleDelete}
                                    categoryColor={getCategoryColor(card.category || '默认')}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </main>

            <KnowledgeModal
                isOpen={!!editingCard || isCreateModal}
                isCreate={isCreateModal}
                card={editingCard}
                onClose={() => { setEditingCard(null); setIsCreateModal(false); }}
                onSave={handleSave}
                onChange={setEditingCard}
            />

            <AIGenerateModal
                isOpen={showAIModal}
                onClose={() => setShowAIModal(false)}
                onSave={handleAISave}
            />

            {studyMode && (
                <StudyModeOverlay
                    cards={filteredCards}
                    studyIndex={studyIndex}
                    studyFlipped={studyFlipped}
                    toggleFlip={toggleStudyFlip}
                    onNext={nextCard}
                    onPrev={prevCard}
                    onExit={exitStudy}
                />
            )}

            {toast && (
                <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'success' ? 'bg-zinc-900 border-t-2 border-emerald-400' : 'bg-red-600'
                    }`}>
                    {toast.type === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                        <AlertCircle className="w-5 h-5 text-white" />
                    )}
                    <span className="text-white font-bold text-sm">{toast.message}</span>
                </div>
            )}

            <style jsx global>{`
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                .scrollbar-thin::-webkit-scrollbar { width: 6px; }
                .scrollbar-thin::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
            `}</style>
        </div>
    );
}
