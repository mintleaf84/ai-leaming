/**
 * @vitest-environment jsdom
 *
 * BackupManager 组件测试
 *
 * 测试策略：
 *  - mock fetch 模拟 API 请求
 *  - 覆盖备份下载、文件选择恢复、历史记录加载与展示
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock sonner
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        loading: vi.fn().mockReturnValue('toast-id'),
    },
}))

import { BackupManager } from '../BackupManager'
import { toast } from 'sonner'

const mockHistory = [
    {
        id: 1,
        action: 'BACKUP_DATABASE',
        username: 'admin',
        filename: 'ai-learning-backup-2026-04-29.db',
        backupCreated: null,
        created_at: '2026-04-29 10:00:00',
    },
    {
        id: 2,
        action: 'RESTORE_DATABASE',
        username: 'admin',
        filename: 'restore.db',
        backupCreated: 'ai-learning.db.bak-123',
        created_at: '2026-04-29 12:00:00',
    },
]

describe('BackupManager', () => {
    let fetchSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.clearAllMocks()
        fetchSpy = vi.fn()
        global.fetch = fetchSpy

        // 默认：backup-history 返回数据
        fetchSpy.mockImplementation((url: string) => {
            if (url === '/api/admin/backup-history') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ history: mockHistory, total: 2 }),
                })
            }
            return Promise.reject(new Error('Unknown URL'))
        })
    })

    it('应加载并展示备份历史记录', async () => {
        render(<BackupManager />)

        // 等待历史数据加载
        expect(await screen.findByText('备份历史')).toBeInTheDocument()
        expect(screen.getByText('ai-learning-backup-2026-04-29.db')).toBeInTheDocument()
        expect(screen.getByText('restore.db')).toBeInTheDocument()

        // 验证标签显示
        const tags = screen.getAllByText(/^(备份|恢复)$/)
        expect(tags).toHaveLength(2)

        // 验证自动备份信息
        expect(screen.getByText(/自动备份: ai-learning.db.bak-123/)).toBeInTheDocument()
    })

    it('无历史记录时应显示空状态', async () => {
        fetchSpy.mockImplementation((url: string) => {
            if (url === '/api/admin/backup-history') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ history: [], total: 0 }),
                })
            }
            return Promise.reject(new Error('Unknown URL'))
        })

        render(<BackupManager />)

        expect(await screen.findByText('暂无备份记录')).toBeInTheDocument()
    })

    it('点击备份按钮应触发下载并刷新历史', async () => {
        const user = userEvent.setup()

        // 创建 blob URL mock
        const mockUrl = 'blob:test'
        vi.spyOn(window.URL, 'createObjectURL').mockReturnValue(mockUrl)
        vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {})

        // Mock response headers
        const mockHeaders = new Headers()
        mockHeaders.set('Content-Disposition', 'filename="test-backup.db"')

        fetchSpy.mockImplementation((url: string) => {
            if (url === '/api/admin/backup') {
                return Promise.resolve({
                    ok: true,
                    blob: () => Promise.resolve(new Blob(['test'])),
                    headers: mockHeaders,
                })
            }
            if (url === '/api/admin/backup-history') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ history: mockHistory, total: 2 }),
                })
            }
            return Promise.reject(new Error('Unknown URL'))
        })

        render(<BackupManager />)
        await screen.findByText('备份历史')

        const backupBtn = screen.getByText('立即下载备份')
        await user.click(backupBtn)

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith('备份已下载', { id: 'toast-id' })
        })

        // 验证 backup-history 被再次调用（刷新）
        const historyCalls = fetchSpy.mock.calls.filter(
            (c: string[]) => c[0] === '/api/admin/backup-history'
        )
        expect(historyCalls.length).toBeGreaterThanOrEqual(2)
    })

    it('备份失败时应显示错误 toast', async () => {
        const user = userEvent.setup()

        fetchSpy.mockImplementation((url: string) => {
            if (url === '/api/admin/backup') {
                return Promise.resolve({ ok: false })
            }
            if (url === '/api/admin/backup-history') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ history: [], total: 0 }),
                })
            }
            return Promise.reject(new Error('Unknown URL'))
        })

        render(<BackupManager />)
        await screen.findByText('备份历史')

        await user.click(screen.getByText('立即下载备份'))

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('备份失败，请查看控制台日志')
        })
    })

    it('应渲染全量备份和数据恢复卡片', async () => {
        render(<BackupManager />)

        expect(screen.getByText('全量备份')).toBeInTheDocument()
        expect(screen.getByText('数据恢复')).toBeInTheDocument()
        expect(screen.getByText('数据安全中心')).toBeInTheDocument()
        expect(screen.getByText('选择备份文件')).toBeInTheDocument()
    })

    it('点击刷新按钮应重新请求历史数据', async () => {
        const user = userEvent.setup()

        render(<BackupManager />)
        await screen.findByText('备份历史')

        // 刷新按钮在"备份历史"标题的同一行右侧
        const heading = screen.getByText('备份历史')
        const headerRow = heading.closest('.flex.items-center.justify-between') as HTMLElement
        const refreshBtn = headerRow.querySelector('button') as HTMLElement

        await user.click(refreshBtn)

        await waitFor(() => {
            const historyCalls = fetchSpy.mock.calls.filter(
                (c: string[]) => c[0] === '/api/admin/backup-history'
            )
            expect(historyCalls.length).toBeGreaterThanOrEqual(2)
        })
    })
})
