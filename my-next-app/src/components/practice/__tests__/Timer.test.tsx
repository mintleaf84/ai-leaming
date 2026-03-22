import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Timer } from '../Timer'

describe('Timer Component', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('renders count_up mode starting from 00:00', () => {
        render(<Timer mode="count_up" />)
        expect(screen.getByText('00:00')).toBeInTheDocument()
    })

    it('increments time in count_up mode', () => {
        render(<Timer mode="count_up" />)
        
        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(screen.getByText('00:01')).toBeInTheDocument()

        act(() => {
            vi.advanceTimersByTime(59000)
        })
        expect(screen.getByText('01:00')).toBeInTheDocument()
    })

    it('renders count_down mode starting from initialSeconds', () => {
        render(<Timer mode="count_down" initialSeconds={120} />)
        expect(screen.getByText('02:00')).toBeInTheDocument()
    })

    it('decrements time in count_down mode and triggers onTimeUp', () => {
        const onTimeUp = vi.fn()
        render(<Timer mode="count_down" initialSeconds={3} onTimeUp={onTimeUp} />)

        act(() => {
            vi.advanceTimersByTime(2000)
        })
        expect(screen.getByText('00:01')).toBeInTheDocument()
        expect(onTimeUp).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(screen.getByText('00:00')).toBeInTheDocument()
        expect(onTimeUp).toHaveBeenCalledTimes(1)
    })

    it('pauses the timer when paused prop is true', () => {
        const { rerender } = render(<Timer mode="count_up" paused={false} />)
        
        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(screen.getByText('00:01')).toBeInTheDocument()

        rerender(<Timer mode="count_up" paused={true} />)
        act(() => {
            vi.advanceTimersByTime(2000)
        })
        expect(screen.getByText('00:01')).toBeInTheDocument() // Still 01
    })

    it('shows warning state when count_down is <= 30s', () => {
        render(<Timer mode="count_down" initialSeconds={31} />)
        const timerContainer = screen.getByText('00:31').parentElement
        expect(timerContainer).not.toHaveClass('animate-pulse')

        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(screen.getByText('00:30')).toBeInTheDocument()
        expect(screen.getByText('00:30').parentElement).toHaveClass('animate-pulse')
    })
})
