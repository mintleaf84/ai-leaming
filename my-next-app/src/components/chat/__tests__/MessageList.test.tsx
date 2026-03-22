import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock ChatMessage component before importing MessageList
vi.mock('./ChatMessage', () => ({
    __esModule: true,
    default: ({ message, onDelete }: any) => (
        <div data-testid="chat-message">
            <span>{message.content}</span>
            <button onClick={onDelete}>Delete</button>
        </div>
    )
}))

import { MessageList } from '../MessageList'

describe('MessageList Component', () => {
    const mockOnDeleteMessage = vi.fn()
    const mockOnSaveToKnowledge = vi.fn()
    const mockOnToggleFavorite = vi.fn()
    const mockOnRetry = vi.fn()
    const messagesEndRef = { current: null } as any

    const mockMessages = [
        { id: '1', role: 'user' as const, content: 'Hello', timestamp: Date.now() },
        { id: '2', role: 'assistant' as const, content: 'Hi there!', timestamp: Date.now() },
    ]

    it('renders empty state when no messages', () => {
        render(
            <MessageList 
                messages={[]}
                isLoading={false}
                error={null}
                lastFailedMessage={null}
                onDeleteMessage={mockOnDeleteMessage}
                onSaveToKnowledge={mockOnSaveToKnowledge}
                onToggleFavorite={mockOnToggleFavorite}
                onRetry={mockOnRetry}
                messagesEndRef={messagesEndRef}
            />
        )

        expect(screen.getByText('你可以问我任何关于教育心理学或教师招聘的问题')).toBeInTheDocument()
    })

    it('renders list of messages', () => {
        render(
            <MessageList 
                messages={mockMessages}
                isLoading={false}
                error={null}
                lastFailedMessage={null}
                onDeleteMessage={mockOnDeleteMessage}
                onSaveToKnowledge={mockOnSaveToKnowledge}
                onToggleFavorite={mockOnToggleFavorite}
                onRetry={mockOnRetry}
                messagesEndRef={messagesEndRef}
            />
        )

        const items = screen.getAllByTestId('chat-message')
        expect(items).toHaveLength(2)
        expect(screen.getByText('Hello')).toBeInTheDocument()
        expect(screen.getByText('Hi there!')).toBeInTheDocument()
    })

    it('shows error message and retry button', () => {
        render(
            <MessageList 
                messages={mockMessages}
                isLoading={false}
                error="Network Timeout"
                lastFailedMessage="Failed msg"
                onDeleteMessage={mockOnDeleteMessage}
                onSaveToKnowledge={mockOnSaveToKnowledge}
                onToggleFavorite={mockOnToggleFavorite}
                onRetry={mockOnRetry}
                messagesEndRef={messagesEndRef}
            />
        )

        expect(screen.getByText(/Network Timeout/)).toBeInTheDocument()
        const retryBtn = screen.getByText('重试')
        fireEvent.click(retryBtn)
        expect(mockOnRetry).toHaveBeenCalledTimes(1)
    })
})
