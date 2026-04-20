import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ChatInput } from '../ChatInput'

describe('ChatInput Component', () => {
    const mockOnSendMessage = vi.fn()
    const mockOnStopGeneration = vi.fn()
    const mockSetEnableRag = vi.fn()

    const defaultProps = {
        isLoading: false,
        showFavorites: false,
        enableRag: false,
        setEnableRag: mockSetEnableRag,
        onSendMessage: mockOnSendMessage,
        onStopGeneration: mockOnStopGeneration
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders correctly', () => {
        render(<ChatInput {...defaultProps} />)
        expect(screen.getByPlaceholderText(/输入问题/)).toBeInTheDocument()
    })

    it('updates value and sends message on form submit', () => {
        render(<ChatInput {...defaultProps} />)
        const textarea = screen.getByPlaceholderText(/输入问题/)
        
        // Type a message
        fireEvent.change(textarea, { target: { value: 'Hello AI' } })
        expect(textarea).toHaveValue('Hello AI')
        
        // Find send button by testid and click
        const sendButton = screen.getByTestId('send-button')
        fireEvent.click(sendButton)
        
        expect(mockOnSendMessage).toHaveBeenCalledWith('Hello AI')
        expect(textarea).toHaveValue('') // Should clear input after sending
    })

    it('submits on Enter key (without shift)', () => {
        render(<ChatInput {...defaultProps} />)
        const textarea = screen.getByPlaceholderText(/输入问题/)
        
        fireEvent.change(textarea, { target: { value: 'Test message' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
        
        expect(mockOnSendMessage).toHaveBeenCalledWith('Test message')
    })

    it('does not submit when Enter + Shift is pressed', () => {
        render(<ChatInput {...defaultProps} />)
        const textarea = screen.getByPlaceholderText(/输入问题/)
        
        fireEvent.change(textarea, { target: { value: 'Test message' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
        
        expect(mockOnSendMessage).not.toHaveBeenCalled()
    })

    it('disables input and shows stop button when isLoading is true', () => {
        render(<ChatInput {...defaultProps} isLoading={true} />)
        const textarea = screen.getByPlaceholderText(/输入问题/)
        
        expect(textarea).toBeDisabled()
        expect(screen.getByTestId('stop-button')).toBeInTheDocument()
        
        fireEvent.click(screen.getByTestId('stop-button'))
        expect(mockOnStopGeneration).toHaveBeenCalled()
    })

    it('shows commands menu when typing "/" and allows selection', () => {
        render(<ChatInput {...defaultProps} />)
        const textarea = screen.getByPlaceholderText(/输入问题/)
        
        fireEvent.change(textarea, { target: { value: '/' } })
        
        // /quiz command should be visible
        const quizCommand = screen.getByText('/quiz')
        expect(quizCommand).toBeInTheDocument()
        
        // Click the command
        fireEvent.click(quizCommand)
        
        // Input should now contain the command
        expect(textarea).toHaveValue('/quiz ')
        // Menu should close
        expect(screen.queryByRole('button', { name: /\/quiz/i })).not.toBeInTheDocument()
    })
})
