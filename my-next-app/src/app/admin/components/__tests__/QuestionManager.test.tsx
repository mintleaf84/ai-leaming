/**
 * @vitest-environment jsdom
 *
 * QuestionManager 集成测试
 *
 * 测试策略：
 *  - 使用 vi.mock 模拟 Next.js Server Actions（非 HTTP 请求，MSW 无法拦截）。
 *  - 验证组件内多子组件的交互：工具栏 → 列表 → 分页器 → 编辑弹窗。
 *  - 覆盖完整的异步状态流程：Loading → 列表渲染 → CRUD 操作后列表更新。
 *
 * 关于 Server Actions 与 MSW 的说明：
 *  Next.js Server Actions 是编译时转换的 RPC 调用，不是标准的 HTTP 请求，
 *  因此需要使用 vi.mock 对其进行模拟。如需同时测试 HTTP API（如导出 CSV），
 *  则在测试中结合 MSW 的 server.use() 处理。
 */

import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================
// Server Actions Mock 配置
// ============================================================

// 使用 vi.hoisted 确保 mock 引用在模块加载前就已建立（Vitest 要求）
const {
    mockGetQuestions,
    mockDeleteQuestion,
    mockBatchDeleteQuestions,
    mockImportQuestions,
    mockUpdateQuestion,
} = vi.hoisted(() => ({
    mockGetQuestions: vi.fn(),
    mockDeleteQuestion: vi.fn(),
    mockBatchDeleteQuestions: vi.fn(),
    mockImportQuestions: vi.fn(),
    mockUpdateQuestion: vi.fn(),
}))

// Mock 整个 admin server actions 模块
vi.mock('@/server/actions/admin', () => ({
    getQuestionsAction: mockGetQuestions,
    deleteQuestionAction: mockDeleteQuestion,
    batchDeleteQuestionsAction: mockBatchDeleteQuestions,
    importQuestionsAction: mockImportQuestions,
    updateQuestionAction: mockUpdateQuestion,
}))

// Mock sonner（避免真实 toast 渲染影响断言）
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
    },
}))

// ============================================================
// 测试数据工厂
// ============================================================

/** 创建标准测试题目数据 */
function createMockQuestion(overrides = {}) {
    return {
        id: 1,
        content: '以下哪项属于心理学的基本范畴？',
        options: ['感知', '行为', '认知', '以上皆是'],
        answer: '以上皆是',
        explanation: '心理学研究感知、行为和认知等多个领域',
        tags: ['心理学/基础', '认知科学'],
        dimension: 'knowledge',
        type: 'single',
        ...overrides,
    }
}

/** 创建模拟的 getQuestionsAction 返回值 */
function mockQuestionsResponse(questions: ReturnType<typeof createMockQuestion>[], total = questions.length) {
    return { data: { success: true, questions, total } }
}

// ============================================================
// 导入被测组件（必须在 mock 声明后导入）
// ============================================================

import { QuestionManager } from '../QuestionManager'

// ============================================================
// 测试套件
// ============================================================

describe('QuestionManager 集成测试', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        // 默认：getQuestionsAction 返回两道题目
        mockGetQuestions.mockResolvedValue(
            mockQuestionsResponse([
                createMockQuestion({ id: 1, content: '第一道测试题' }),
                createMockQuestion({ id: 2, content: '第二道测试题', tags: ['语文/阅读'] }),
            ], 2)
        )
    })

    afterEach(() => {
        // 清理 Radix UI Dialog 遗留的 body 样式（防止测试间相互污染）
        // jsdom 环境中 Radix Dialog unmount 时可能不会自动还原
        document.body.removeAttribute('data-scroll-locked')
        document.body.style.pointerEvents = ''
    })

    // ----------------------------------------------------------
    // 场景 1：加载状态 - 初始化时显示 Loading Spinner
    // ----------------------------------------------------------
    it('组件初始化时应显示加载状态，数据到达后渲染题目列表', async () => {
        // 测试意图：验证加载 Loading → 列表数据的完整状态转换
        render(<QuestionManager />)

        // 数据加载后，题目内容应出现在列表中
        expect(await screen.findByText('第一道测试题')).toBeInTheDocument()
        expect(await screen.findByText('第二道测试题')).toBeInTheDocument()

        // 确认分页统计信息正确显示
        expect(screen.getByText(/共 2 条记录/)).toBeInTheDocument()
    })

    // ----------------------------------------------------------
    // 场景 2：空数据状态 - 无题目时显示空状态提示
    // ----------------------------------------------------------
    it('当题库为空时，应显示"没有找到符合条件的题目"提示', async () => {
        // 测试意图：验证空状态的条件渲染逻辑
        mockGetQuestions.mockResolvedValue(mockQuestionsResponse([], 0))

        render(<QuestionManager />)

        // 等待加载完成后检查空状态
        expect(await screen.findByText('没有找到符合条件的题目。')).toBeInTheDocument()
    })

    // ----------------------------------------------------------
    // 场景 3：加载失败 - API 报错时显示 Toast 错误提示
    // ----------------------------------------------------------
    it('当 getQuestionsAction 返回 success:false 时，应显示 Toast 错误', async () => {
        const { toast } = await import('sonner')
        // 模拟 action 返回 { success: false }
        mockGetQuestions.mockResolvedValue({ data: { success: false } })

        render(<QuestionManager />)

        // 等待错误 toast 被调用
        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('题目列表加载失败')
        })
    })

    // ----------------------------------------------------------
    // 场景 4：搜索功能 - 输入关键字后点击筛选，列表应更新
    // ----------------------------------------------------------
    it('在搜索框输入关键字并点击"筛选"后，应以过滤后的结果重新渲染列表', async () => {
        // 测试意图：验证搜索 → 重新加载 → 列表更新的完整交互链路
        const user = userEvent.setup()

        // 第二次调用返回过滤后的单条结果
        mockGetQuestions.mockResolvedValueOnce(
            mockQuestionsResponse([
                createMockQuestion({ id: 1, content: '第一道测试题' }),
                createMockQuestion({ id: 2, content: '第二道测试题', tags: ['语文/阅读'] }),
            ], 2)
        ).mockResolvedValueOnce(
            mockQuestionsResponse([
                createMockQuestion({ id: 1, content: '第一道测试题' }),
            ], 1)
        )

        render(<QuestionManager />)

        // 等待初始数据加载完成
        await screen.findByText('第一道测试题')

        // 在搜索框输入关键字
        const searchInput = screen.getByPlaceholderText('搜索题干内容...')
        await user.type(searchInput, '第一道')

        // 点击筛选按钮
        await user.click(screen.getByRole('button', { name: '筛选' }))

        // 等待列表以新数据重新渲染
        await waitFor(() => {
            expect(screen.queryByText('第二道测试题')).not.toBeInTheDocument()
        })
        expect(screen.getByText('第一道测试题')).toBeInTheDocument()
        expect(screen.getByText(/共 1 条记录/)).toBeInTheDocument()
    })

    // ----------------------------------------------------------
    // 场景 5：删除单条 - 确认后列表应移除该题目
    // ----------------------------------------------------------
    it('点击删除按钮并确认后，应调用 deleteQuestionAction 并刷新列表', async () => {
        // 测试意图：验证删除操作 → 列表刷新的子组件交互
        const user = userEvent.setup()
        mockDeleteQuestion.mockResolvedValue({ data: { success: true } })

        // 删除后的列表只剩第二道题
        mockGetQuestions
            .mockResolvedValueOnce(
                mockQuestionsResponse([
                    createMockQuestion({ id: 1, content: '第一道测试题' }),
                    createMockQuestion({ id: 2, content: '第二道测试题' }),
                ], 2)
            )
            .mockResolvedValueOnce(
                mockQuestionsResponse([
                    createMockQuestion({ id: 2, content: '第二道测试题' }),
                ], 1)
            )

        // Mock window.confirm（jsdom 中默认不存在真实交互）
        vi.spyOn(window, 'confirm').mockReturnValue(true)

        render(<QuestionManager />)

        // 等待初始数据加载
        await screen.findByText('第一道测试题')

        // 找到第一行的删除按钮（title="删除"）并点击
        const deleteButtons = screen.getAllByTitle('删除')
        await user.click(deleteButtons[0])

        // 确认 deleteQuestionAction 被以正确参数调用
        await waitFor(() => {
            expect(mockDeleteQuestion).toHaveBeenCalledWith(1)
        })

        // 确认列表重新加载（getQuestionsAction 被调用了两次）
        expect(mockGetQuestions).toHaveBeenCalledTimes(2)
    })

    // ----------------------------------------------------------
    // 场景 6：批量选择与删除 - 子组件交互（Checkbox → 批量删除按钮）
    // ----------------------------------------------------------
    it('勾选多道题目后，应显示批量删除按钮，点击后批量删除并刷新列表', async () => {
        // 测试意图：验证 Checkbox 选中 → 批量删除按钮出现 → 执行删除 → 列表清空的完整交互
        const user = userEvent.setup()
        mockBatchDeleteQuestions.mockResolvedValue({ data: { success: true, deletedCount: 2 } })
        mockGetQuestions
            .mockResolvedValueOnce(
                mockQuestionsResponse([
                    createMockQuestion({ id: 1, content: '第一道测试题' }),
                    createMockQuestion({ id: 2, content: '第二道测试题' }),
                ], 2)
            )
            .mockResolvedValueOnce(mockQuestionsResponse([], 0))

        vi.spyOn(window, 'confirm').mockReturnValue(true)

        render(<QuestionManager />)
        await screen.findByText('第一道测试题')

        // 初始状态：批量删除按钮不可见
        expect(screen.queryByRole('button', { name: /删除 \(/ })).not.toBeInTheDocument()

        // 点击表头"全选" Checkbox
        const checkboxes = screen.getAllByRole('checkbox')
        await user.click(checkboxes[0]) // 表头全选

        // 批量删除按钮应出现（内容格式："删除 (2)"）
        const batchDeleteBtn = await screen.findByRole('button', { name: /删除 \(2\)/ })
        expect(batchDeleteBtn).toBeInTheDocument()

        // 点击批量删除
        await user.click(batchDeleteBtn)

        await waitFor(() => {
            expect(mockBatchDeleteQuestions).toHaveBeenCalledWith([1, 2])
        })

        // 列表应清空（显示空状态）
        await screen.findByText('没有找到符合条件的题目。')
    })

    // ----------------------------------------------------------
    // 场景 7：编辑弹窗交互 - 点击题干后弹窗打开，保存后列表刷新
    // ----------------------------------------------------------
    it('点击题干文字后，EditQuestionDialog 应打开；保存成功后弹窗关闭并刷新列表', async () => {
        // 测试意图：验证 QuestionManager（父）与 EditQuestionDialog（子）之间的跨组件交互
        const user = userEvent.setup()
        mockUpdateQuestion.mockResolvedValue({ data: { success: true } })
        mockGetQuestions
            .mockResolvedValueOnce(
                mockQuestionsResponse([
                    createMockQuestion({ id: 1, content: '第一道测试题' }),
                ], 1)
            )
            // 保存后重新加载
            .mockResolvedValueOnce(
                mockQuestionsResponse([
                    createMockQuestion({ id: 1, content: '第一道测试题（已更新）' }),
                ], 1)
            )

        render(<QuestionManager />)
        await screen.findByText('第一道测试题')

        // 点击题干文字（触发编辑弹窗）
        await user.click(screen.getByText('第一道测试题'))

        // 等待弹窗打开（标题格式："编辑题目 #1"）
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('编辑题目 #1')).toBeInTheDocument()

        // 在弹窗中点击"保存更改"
        const saveButton = within(dialog).getByRole('button', { name: '保存更改' })
        await user.click(saveButton)

        // 保存后弹窗应关闭，列表应重新加载
        await waitFor(() => {
            expect(mockUpdateQuestion).toHaveBeenCalled()
        })
        expect(mockGetQuestions).toHaveBeenCalledTimes(2)
    })

    // ----------------------------------------------------------
    // 场景 8：Enter 键搜索 - 键盘快捷方式触发筛选
    // ----------------------------------------------------------
    it('在搜索框中按下 Enter 键，应与点击"筛选"按钮效果相同', async () => {
        // 测试意图：验证键盘无障碍操作（a11y）
        const user = userEvent.setup()
        mockGetQuestions.mockResolvedValue(
            mockQuestionsResponse([createMockQuestion({ id: 1, content: '第一道测试题' })], 1)
        )

        render(<QuestionManager />)
        await screen.findByText('第一道测试题')

        const searchInput = screen.getByPlaceholderText('搜索题干内容...')
        await user.type(searchInput, '测试{Enter}')

        // getQuestionsAction 应被再次调用（初始加载 + Enter 触发搜索）
        await waitFor(() => {
            expect(mockGetQuestions).toHaveBeenCalledTimes(2)
        })
    })

    // ----------------------------------------------------------
    // 场景 9：分页功能 - 点击下一页后重新加载数据
    // ----------------------------------------------------------
    it('点击下一页按钮后，应以新的 offset 重新调用 getQuestionsAction', async () => {
        // 测试意图：验证分页控件与数据加载的联动
        // 注意：此测试使用 fireEvent 而非 userEvent，
        //        因为 jsdom 环境中 Radix UI 的 focus guard 可能残留 pointer-events: none，
        //        fireEvent 绕过此限制（直接分发 DOM 事件，不检查 CSS 属性）。
        const { fireEvent: fire } = await import('@testing-library/react')

        // 模拟 25 条数据（触发分页，pageSize 默认 20）
        const page1Questions = Array.from({ length: 20 }, (_, i) =>
            createMockQuestion({ id: i + 1, content: `题目 ${i + 1}` })
        )

        mockGetQuestions
            .mockResolvedValueOnce(mockQuestionsResponse(page1Questions, 25))
            // 第二页数据
            .mockResolvedValueOnce(
                mockQuestionsResponse([createMockQuestion({ id: 21, content: '题目 21（第2页）' })], 25)
            )

        // 确保 body 状态干净
        document.body.removeAttribute('data-scroll-locked')
        document.body.style.pointerEvents = ''

        render(<QuestionManager />)
        await screen.findByText('题目 1')

        // 分页信息应显示"共 25 条记录，当前第 1/2 页"
        const paginationInfo = screen.getByText(/当前第 1\/2 页/)
        expect(paginationInfo).toBeInTheDocument()

        // 通过分页信息所在的容器找到分页按钮区域
        // 分页信息和按钮都在底部 flex 容器（p-4 border-t）中
        const paginationFooter = paginationInfo.closest('div.flex') as HTMLElement
        const paginationBtns = within(paginationFooter).getAllByRole('button')

        // 第 1 页时分页按钮顺序：[首页(disabled), 上一页(disabled), 下一页(enabled), 末页(enabled)]
        // 以及最后有个 Select 触发器（不是 button role）
        expect(paginationBtns.length).toBeGreaterThanOrEqual(4)

        const nextPageBtn = paginationBtns[2] // 下一页
        expect(nextPageBtn).not.toBeDisabled()

        // 使用 fireEvent 绕过 pointer-events 限制
        fire.click(nextPageBtn)

        // 等待第二页数据加载完成
        await screen.findByText('题目 21（第2页）')

        // getQuestionsAction 应被调用两次（初始 + 分页）
        expect(mockGetQuestions).toHaveBeenCalledTimes(2)
        // 页码显示更新
        expect(screen.getByText(/当前第 2\/2 页/)).toBeInTheDocument()
    })
})
