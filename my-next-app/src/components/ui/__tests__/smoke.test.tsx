import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from '../input'
import { Checkbox } from '../checkbox'
import { Badge } from '../badge'

describe('Base UI Components Smoke Tests', () => {
    describe('Input', () => {
        it('renders correctly and handles value changes', () => {
            render(<Input placeholder="Enter text" />)
            const input = screen.getByPlaceholderText('Enter text') as HTMLInputElement
            expect(input).toBeInTheDocument()
            
            fireEvent.change(input, { target: { value: 'test' } })
            expect(input.value).toBe('test')
        })

        it('supports disabled state', () => {
            render(<Input disabled placeholder="Disabled" />)
            expect(screen.getByPlaceholderText('Disabled')).toBeDisabled()
        })
    })

    describe('Checkbox', () => {
        it('renders correctly and toggles state', () => {
            render(<Checkbox id="terms" />)
            const checkbox = screen.getByRole('checkbox')
            expect(checkbox).toBeInTheDocument()
            
            // Should be unchecked by default
            expect(checkbox).toHaveAttribute('data-state', 'unchecked')
            
            fireEvent.click(checkbox)
            // Radix UI Checkbox uses data-state instead of checked attribute for styling
            expect(checkbox).toHaveAttribute('data-state', 'checked')
        })
    })

    describe('Badge', () => {
        it('renders with different variants', () => {
            const { rerender } = render(<Badge>Default</Badge>)
            expect(screen.getByText('Default')).toBeInTheDocument()
            expect(screen.getByText('Default')).toHaveClass('bg-primary')

            rerender(<Badge variant="destructive">Error</Badge>)
            expect(screen.getByText('Error')).toHaveClass('bg-destructive')

            rerender(<Badge variant="success">Pass</Badge>)
            expect(screen.getByText('Pass')).toHaveClass('bg-green-500/10')
        })
    })
})
