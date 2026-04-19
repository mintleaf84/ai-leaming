/**
 * @vitest-environment jsdom
 *
 * LoginPage 集成测试
 *
 * 测试策略：
 *  - 使用 MSW 拦截真实的 fetch('/api/auth/login') 请求，模拟不同服务端响应。
 *  - 遵循"像用户一样测试"原则：通过占位符、角色、文本查找元素。
 *  - 覆盖场景：加载状态、错误响应、成功跳转、网络异常。
 *
 * 关于 MSW 生命周期：
 *  MSW 只在本测试文件中启动，不会影响其他使用 vi.stubGlobal('fetch') 的测试文件。
 *  这是 MSW 的最佳实践：按需启用，而非全局拦截。
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach, afterAll } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import LoginPage from '../page'

// ============================================================
// MSW 服务器生命周期（仅限本文件）
// ============================================================

// 本测试文件的所有测试开始前，启动 MSW 服务器
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

// 每个测试完成后，重置为默认 handlers，避免测试间相互污染
afterEach(() => server.resetHandlers())

// 所有测试结束后，关闭服务器
afterAll(() => server.close())

// ============================================================
// Next.js 特有 Mock 方案
// ============================================================

// useRouter 是 Next.js 特有的 hook，jsdom 中无法真实运行
// 解决方案：vi.mock 整个 next/navigation 模块
const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
        refresh: mockRefresh,
        back: vi.fn(),
        forward: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
    }),
    // Link 组件同样来自 next/navigation 生态，需要 mock
    usePathname: () => '/login',
    useSearchParams: () => new URLSearchParams(),
}))

// ============================================================
// 辅助函数：渲染登录页并填写表单
// ============================================================

/**
 * 渲染 LoginPage 并模拟用户在表单中输入账号密码
 */
async function renderAndFillForm(username: string, password: string) {
    const user = userEvent.setup()
    render(<LoginPage />)

    // 通过占位符文本查找输入框（优先使用 findByPlaceholderText，符合用户视角）
    const usernameInput = screen.getByPlaceholderText('用户名')
    const passwordInput = screen.getByPlaceholderText('密码')

    await user.type(usernameInput, username)
    await user.type(passwordInput, password)

    return { user, usernameInput, passwordInput }
}

// ============================================================
// 测试套件
// ============================================================

describe('LoginPage 集成测试', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    // ----------------------------------------------------------
    // 场景 1：初始渲染 - 验证页面基础结构
    // ----------------------------------------------------------
    it('应正确渲染登录表单的所有关键元素', () => {
        // 测试意图：确保页面加载后，用户能看到所有必要的 UI 元素
        render(<LoginPage />)

        // 通过文本内容（用户可见文字）定位元素
        expect(screen.getByText('欢迎回来')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('用户名')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('密码')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '立即登录' })).toBeInTheDocument()
        expect(screen.getByText('立即加入')).toBeInTheDocument()
    })

    // ----------------------------------------------------------
    // 场景 2：加载状态 - 提交表单期间按钮应禁用并显示 Loading
    // ----------------------------------------------------------
    it('提交表单时，按钮应显示加载状态且不可再次点击', async () => {
        // 测试意图：防止重复提交，确保 UI 给出加载反馈
        //
        // MSW 技巧：使用 server.use() 覆盖默认 handler，注入一个"永远不响应"的处理器
        // 以便在请求 pending 期间检查 UI 状态
        server.use(
            http.post('/api/auth/login', async () => {
                // 模拟网络延迟：返回一个永不 resolve 的 Promise
                await new Promise(() => { /* 永远挂起，只在此测试中有效 */ })
                return HttpResponse.json({})
            })
        )

        const { user } = await renderAndFillForm('admin', 'password123')
        const submitButton = screen.getByRole('button', { name: '立即登录' })

        await user.click(submitButton)

        // 等待按钮进入禁用状态（加载中）
        await waitFor(() => {
            expect(submitButton).toBeDisabled()
        })

        // 此时按钮不应再显示"立即登录"文字（已被 Loader2 图标替换）
        expect(screen.queryByText('立即登录')).not.toBeInTheDocument()
    })

    // ----------------------------------------------------------
    // 场景 3：错误状态 - 凭证错误时显示错误提示
    // ----------------------------------------------------------
    it('输入错误密码时，应显示服务器返回的错误信息', async () => {
        // 测试意图：验证 API 错误响应能正确传递并呈现给用户
        //
        // MSW 覆盖：模拟服务器返回 401 和错误消息
        server.use(
            http.post('/api/auth/login', () => {
                return HttpResponse.json(
                    { error: '用户名或密码错误' },
                    { status: 401 }
                )
            })
        )

        const { user } = await renderAndFillForm('admin', 'wrong-password')
        await user.click(screen.getByRole('button', { name: '立即登录' }))

        // 等待错误提示出现（使用 findByText，自动处理异步渲染）
        const errorMsg = await screen.findByText('用户名或密码错误')
        expect(errorMsg).toBeInTheDocument()

        // 确认页面没有发生跳转
        expect(mockPush).not.toHaveBeenCalled()
    })

    // ----------------------------------------------------------
    // 场景 4：成功状态 - 登录成功后跳转到 /dashboard
    // ----------------------------------------------------------
    it('输入正确凭证后，应成功登录并跳转到 /dashboard', async () => {
        // 测试意图：验证完整的登录成功流程（填写 → 提交 → 跳转）
        //
        // 此处使用 tests/msw/handlers.ts 中的默认 handler（admin/password123 → 200）
        const { user } = await renderAndFillForm('admin', 'password123')
        await user.click(screen.getByRole('button', { name: '立即登录' }))

        // 等待路由跳转被调用
        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith('/dashboard')
        })

        // router.refresh() 应被调用以刷新服务端 Session 状态
        expect(mockRefresh).toHaveBeenCalled()

        // 错误信息不应出现
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    // ----------------------------------------------------------
    // 场景 5：网络异常 - fetch 本身抛出异常
    // ----------------------------------------------------------
    it('网络请求失败时，应显示"无法连接到服务器"提示', async () => {
        // 测试意图：处理网络层面的异常（非 HTTP 错误，而是 fetch 抛出错误）
        server.use(
            http.post('/api/auth/login', () => {
                // MSW 通过返回 HttpResponse.error() 模拟网络层错误（触发 fetch 抛出 TypeError）
                return HttpResponse.error()
            })
        )

        const { user } = await renderAndFillForm('admin', 'any-password')
        await user.click(screen.getByRole('button', { name: '立即登录' }))

        // 等待错误提示出现
        const errorMsg = await screen.findByText('无法连接到服务器')
        expect(errorMsg).toBeInTheDocument()
    })

    // ----------------------------------------------------------
    // 场景 6：空字段提交 - 原生 HTML 验证应阻止提交
    // ----------------------------------------------------------
    it('提交空表单时，不应发出网络请求', async () => {
        // 测试意图：确保表单的 required 属性生效，防止无效请求
        const user = userEvent.setup()
        render(<LoginPage />)

        // 直接点击提交，不填写任何内容
        await user.click(screen.getByRole('button', { name: '立即登录' }))

        // 网络请求不应被触发（路由不跳转，错误提示不出现）
        expect(mockPush).not.toHaveBeenCalled()
        expect(screen.queryByText('用户名或密码错误')).not.toBeInTheDocument()
        expect(screen.queryByText('无法连接到服务器')).not.toBeInTheDocument()
    })
})
