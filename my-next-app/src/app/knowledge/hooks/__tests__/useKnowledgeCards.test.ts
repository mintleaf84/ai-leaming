/**
 * useKnowledgeCards Hook 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useKnowledgeCards } from '../useKnowledgeCards';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock window.confirm
vi.stubGlobal('confirm', vi.fn(() => true));

/** 每个测试用例创建独立的 QueryClient wrapper */
function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false, staleTime: 0 },
        },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
    Wrapper.displayName = 'QueryClientWrapper';
    return Wrapper;
}

// 模拟 API 返回数据
const mockApiResponse = {
    cards: [
        { id: 1, title: '测试卡片1', front: '正面1', back: '背面1', tags: ['标签1'] },
        { id: 2, title: '测试卡片2', front: '正面2', back: '背面2', tags: ['标签2'] },
    ],
    categories: ['分类A', '分类B'],
    stats: { total: 2, byCategory: [{ category: '分类A', count: 1 }] },
};

describe('useKnowledgeCards', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        // 默认返回成功响应
        mockFetch.mockResolvedValue(new Response(JSON.stringify(mockApiResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
    });

    it('应该自动加载知识卡片列表', async () => {
        const { result } = renderHook(() => useKnowledgeCards(), { wrapper: createWrapper() });

        // 初始状态为 loading
        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.cards).toHaveLength(2);
        expect(result.current.categories).toEqual(['分类A', '分类B']);
        expect(result.current.stats.total).toBe(2);
    });

    it('应该支持按搜索关键词过滤卡片', async () => {
        const { result } = renderHook(() => useKnowledgeCards(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.loading).toBe(false));

        act(() => {
            result.current.setSearchQuery('卡片1');
        });

        expect(result.current.filteredCards).toHaveLength(1);
        expect(result.current.filteredCards[0].title).toBe('测试卡片1');
    });

    it('删除卡片后应重新获取列表', async () => {
        const { result } = renderHook(() => useKnowledgeCards(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.loading).toBe(false));

        // 模拟删除 API 调用
        mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));
        // 模拟删除后的重新获取
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({
            ...mockApiResponse,
            cards: [mockApiResponse.cards[1]],
            stats: { total: 1, byCategory: [] },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        await act(async () => {
            result.current.handleDelete(1);
        });

        // 验证"删除"请求发送了
        await waitFor(() => {
            const deleteCalls = mockFetch.mock.calls.filter(
                (call: any[]) => call[1]?.method === 'DELETE'
            );
            expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
        });
    });

    it('保存卡片后应重新获取列表并关闭编辑态', async () => {
        const { result } = renderHook(() => useKnowledgeCards(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.loading).toBe(false));

        // 设置编辑状态
        act(() => {
            result.current.setEditingCard({ title: '新卡片', front: 'Q', back: 'A' });
            result.current.setIsCreateModal(true);
        });

        expect(result.current.editingCard).not.toBeNull();

        // 模拟保存 API
        mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));
        // 模拟刷新
        mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockApiResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));

        await act(async () => {
            result.current.handleSave();
        });

        // 保存成功后编辑态应关闭
        await waitFor(() => {
            expect(result.current.editingCard).toBeNull();
            expect(result.current.isCreateModal).toBe(false);
        });
    });

    it('API 失败时应显示错误 toast', async () => {
        // 首次加载正常
        const { result } = renderHook(() => useKnowledgeCards(), { wrapper: createWrapper() });
        await waitFor(() => expect(result.current.loading).toBe(false));

        // 模拟保存失败
        mockFetch.mockResolvedValueOnce(new Response('error', { status: 500, statusText: 'ISE' }));

        act(() => {
            result.current.setEditingCard({ title: '失败卡片' });
        });

        await act(async () => {
            result.current.handleSave();
        });

        await waitFor(() => {
            expect(result.current.toast?.type).toBe('error');
        });
    });
});
