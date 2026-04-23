// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- AdmZip 状态：使用模块级共享数组，vi.mock 回调中直接引用同一引用 ----
// beforeEach 通过 mockZipEntries.length = 0 清空，保持测试隔离性
const mockZipEntries: {
    entryName: string;
    isDirectory: boolean;
    getData: () => Buffer;
}[] = [];

// 使用普通函数（非箭头函数）让 new AdmZip() 能够作为构造函数调用
vi.mock('adm-zip', () => {
    return {
        default: class MockAdmZip {
            getEntries() {
                return mockZipEntries;
            }
        },
    };
});

// ---- Mock fs/promises（使用 vi.hoisted 保持引用一致性） ----
const { mockWriteFile, mockMkdir } = vi.hoisted(() => ({
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs/promises', () => ({
    default: { mkdir: mockMkdir, writeFile: mockWriteFile },
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
}));

// ---- Mock textbookService ----
const { mockTextbookService } = vi.hoisted(() => ({
    mockTextbookService: {
        createTextbook: vi.fn().mockResolvedValue(42),
        updateTextbookCover: vi.fn().mockResolvedValue(undefined),
        addChapter: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('./textbook', () => ({ textbookService: mockTextbookService }));
vi.mock('@/lib/services/textbook', () => ({ textbookService: mockTextbookService }));

// ---- Mock markdown-parser ----
const { mockParseMarkdownToChapters } = vi.hoisted(() => ({
    mockParseMarkdownToChapters: vi.fn().mockReturnValue([
        { title: '第一章', content: '内容', level: 1 },
    ]),
}));

vi.mock('@/lib/utils/markdown-parser', () => ({
    parseMarkdownToChapters: mockParseMarkdownToChapters,
}));

import { mineruService } from '@/lib/services/mineru-service';

// ---- 辅助：构造 ZIP Entry ----
const makeEntry = (entryName: string, content: string, isDirectory = false) => ({
    entryName,
    isDirectory,
    getData: () => Buffer.from(content, 'utf8'),
});

const makeImageEntry = (entryName: string) => ({
    entryName,
    isDirectory: false,
    getData: () => Buffer.from('fake image data'),
});

describe('mineruService.processMineruZip', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // 重置条目列表
        mockZipEntries.length = 0;
        mockTextbookService.createTextbook.mockResolvedValue(42);
        mockTextbookService.updateTextbookCover.mockResolvedValue(undefined);
        mockTextbookService.addChapter.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);
        mockMkdir.mockResolvedValue(undefined);
    });

    it('找不到 full.md 时应抛出错误', async () => {
        mockZipEntries.push(makeEntry('some-file.txt', 'hello'));

        await expect(
            mineruService.processMineruZip(Buffer.from(''), 'test.zip')
        ).rejects.toThrow('Invalid Mineru Export: full.md not found in zip');
    });

    it('应该从 full.md 提取 H1 标题', async () => {
        mockZipEntries.push(makeEntry('NoteBook/full.md', '# 数学基础\n\n正文内容'));

        await mineruService.processMineruZip(Buffer.from(''), 'export.zip');

        expect(mockTextbookService.createTextbook).toHaveBeenCalledWith(
            expect.objectContaining({ title: '数学基础' })
        );
    });

    it('无 H1 时应使用文件名作为标题', async () => {
        mockZipEntries.push(makeEntry('folder/full.md', '没有 H1 的内容'));

        await mineruService.processMineruZip(Buffer.from(''), 'my_notebook.zip');

        expect(mockTextbookService.createTextbook).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'my_notebook' })
        );
    });

    it('应该提取图片并调用 writeFile', async () => {
        mockZipEntries.push(makeEntry('book/full.md', '# 标题'));
        mockZipEntries.push(makeImageEntry('book/images/fig1.png'));
        mockZipEntries.push(makeImageEntry('book/images/fig2.jpg'));

        await mineruService.processMineruZip(Buffer.from(''), 'book.zip');

        expect(mockWriteFile).toHaveBeenCalledTimes(2);
    });

    it('应该用第一张图片更新封面', async () => {
        mockZipEntries.push(makeEntry('book/full.md', '# 封面测试'));
        mockZipEntries.push(makeImageEntry('book/images/cover.jpg'));

        await mineruService.processMineruZip(Buffer.from(''), 'book.zip');

        expect(mockTextbookService.updateTextbookCover).toHaveBeenCalledWith(
            42,
            '/books/42/images/cover.jpg'
        );
    });

    it('无图片时不应调用 updateTextbookCover', async () => {
        mockZipEntries.push(makeEntry('folder/full.md', '# 无图片'));

        await mineruService.processMineruZip(Buffer.from(''), 'noimg.zip');

        expect(mockTextbookService.updateTextbookCover).not.toHaveBeenCalled();
    });

    it('应该将图片路径替换为绝对路径', async () => {
        mockZipEntries.push(
            makeEntry('docs/full.md', '# 图片测试\n\n![图片](images/photo.png)')
        );

        await mineruService.processMineruZip(Buffer.from(''), 'docs.zip');

        // 验证传递给章节解析的 markdown 中已替换路径
        const processedMarkdown = mockParseMarkdownToChapters.mock.calls[0][0];
        expect(processedMarkdown).toContain('/books/42/images/photo.png');
        // 原始的相对路径格式 '![](images/photo.png)' 不应出现
        expect(processedMarkdown).not.toMatch(/\!\[.*\]\(images\/photo\.png\)/);
    });

    it('应该为每个章节调用 addChapter', async () => {
        mockParseMarkdownToChapters.mockReturnValueOnce([
            { title: '第一章', content: '内容1', level: 1 },
            { title: '第二章', content: '内容2', level: 1 },
        ]);

        mockZipEntries.push(makeEntry('root/full.md', '# 书名\n## 第一章\n## 第二章'));

        const result = await mineruService.processMineruZip(Buffer.from(''), 'book.zip');

        expect(mockTextbookService.addChapter).toHaveBeenCalledTimes(2);
        expect(result.chapterCount).toBe(2);
        expect(result.bookId).toBe(42);
    });

    it('应该跳过 __MACOSX 文件夹中的条目', async () => {
        mockZipEntries.push(makeEntry('book/full.md', '# 标题'));
        mockZipEntries.push(makeImageEntry('__MACOSX/book/images/icon.png'));

        await mineruService.processMineruZip(Buffer.from(''), 'mac.zip');

        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('full.md 在根目录时应正确处理图片路径', async () => {
        mockZipEntries.push(makeEntry('full.md', '# 根目录测试'));
        mockZipEntries.push(makeImageEntry('images/root-img.png'));

        await mineruService.processMineruZip(Buffer.from(''), 'root.zip');

        expect(mockWriteFile).toHaveBeenCalled();
    });
});
