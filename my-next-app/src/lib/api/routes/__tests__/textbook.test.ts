// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../textbook';

// Mock Drizzle & Schema
const { mockDrizzle } = vi.hoisted(() => ({
    mockDrizzle: {
        select: vi.fn(),
    }
}));
vi.mock('@/lib/db', () => ({ drizzleDb: mockDrizzle }));
vi.mock('@/lib/db/drizzle-schema', () => ({ 
    textbook_chapters: { id: 'textbook_chapters.id', textbook_id: 'textbook_chapters.textbook_id' } 
}));

// Mock textbookService
const { mockTextbookService } = vi.hoisted(() => {
    return {
        mockTextbookService: {
            deleteTextbook: vi.fn(),
            getAllTextbooks: vi.fn(),
            getTextbook: vi.fn(),
            getChapters: vi.fn(),
        }
    };
});

vi.mock('@/lib/services/textbook', () => ({ textbookService: mockTextbookService }));

// Mock Auth
vi.mock('@/lib/api/middlewares/auth', () => ({
    authMiddleware: async (c: any, next: any) => {
        await next();
    }
}));
vi.mock('@/lib/auth/auth', () => ({
    requireRole: vi.fn().mockResolvedValue({ id: 1, role: 'admin', username: 'admin_user' })
}));

const sampleTextbook = {
    id: 1,
    title: '测试教材',
    author: '作者A',
    description: '简介',
    cover_url: '',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
};

const sampleChapter = {
    id: 10,
    textbook_id: 1,
    title: '第一章',
    content: '内容',
    order_index: 1,
    parent_id: undefined,
    level: 1,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
};

describe('Textbook Hono 路由', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ==================== GET / ====================

    describe('GET /', () => {
        it('应返回教材列表（含章节数）', async () => {
            mockTextbookService.getAllTextbooks.mockResolvedValue([sampleTextbook]);
            
            const countMockChain = {
                from: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                get: vi.fn().mockResolvedValue({ value: 3 })
            };
            mockDrizzle.select.mockReturnValue(countMockChain);

            const res = await app.request('/');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveLength(1);
            expect(data[0].id).toBe(1);
            expect(data[0].chapterCount).toBe(3);
        });

        it('无教材时应返回空数组', async () => {
            mockTextbookService.getAllTextbooks.mockResolvedValue([]);
            const res = await app.request('/');
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual([]);
        });
    });

    // ==================== GET /:id ====================

    describe('GET /:id', () => {
        it('应返回教材详情与章节列表', async () => {
            mockTextbookService.getTextbook.mockResolvedValue(sampleTextbook);
            mockTextbookService.getChapters.mockResolvedValue([sampleChapter]);

            const res = await app.request('/1');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe(1);
            expect(data.chapters).toHaveLength(1);
            expect(data.chapters[0].title).toBe('第一章');
        });

        it('教材不存在时应返回 404', async () => {
            mockTextbookService.getTextbook.mockResolvedValue(undefined);
            const res = await app.request('/999');
            expect(res.status).toBe(404);
        });

        it('ID 非数字时应返回 400', async () => {
            const res = await app.request('/abc');
            expect(res.status).toBe(400);
        });
    });

    // ==================== DELETE /:id ====================

    describe('DELETE /:id', () => {
        it('应成功删除教材并返回 200', async () => {
            mockTextbookService.deleteTextbook.mockResolvedValue(true);

            const res = await app.request('/123', {
                method: 'DELETE'
            });

            expect(res.status).toBe(200);
            expect(mockTextbookService.deleteTextbook).toHaveBeenCalledWith(123);
        });

        it('ID 非数字时应返回 400', async () => {
            const res = await app.request('/abc', {
                method: 'DELETE'
            });

            expect(res.status).toBe(400);
        });
    });
});

