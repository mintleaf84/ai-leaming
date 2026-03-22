import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatModeToggle } from '../ChatModeToggle'

describe('ChatModeToggle Component', () => {
    const mockOnModeChange = vi.fn()

    it('renders standard mode by default', () => {
        render(<ChatModeToggle mode="standard" onModeChange={mockOnModeChange} />)
        expect(screen.getByText('标准助手')).toBeInTheDocument()
    })

    it('renders socratic mode when passed', () => {
        render(<ChatModeToggle mode="socratic" onModeChange={mockOnModeChange} />)
        expect(screen.getByText('苏格拉底导师')).toBeInTheDocument()
    })

    // Dropdown testing can be tricky with JSDOM if radicals/portals are used.
    // shadcn/ui uses Radix UI which might need special handling or just testing the trigger.
    it('shows dropdown items when clicked', async () => {
        render(<ChatModeToggle mode="standard" onModeChange={mockOnModeChange} />)
        
        const trigger = screen.getByRole('button')
        fireEvent.click(trigger)
        
        // In JSDOM, Radix might render the content in a portal. 
        // We look for the menu items.
        expect(await screen.findByText('直接回答，简洁明了')).toBeInTheDocument()
        expect(await screen.findByText('循循善诱，启发思考')).toBeInTheDocument()

        fireEvent.click(screen.getByText('循循善诱，启发思考'))
        expect(mockOnModeChange).toHaveBeenCalledWith('socratic')
    })
})
