import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useKeyboardShortcuts } from '../use-keyboard-shortcuts'

describe('useKeyboardShortcuts', () => {
    const mockSubmitAnswer = vi.fn()

    beforeEach(() => {
        mockSubmitAnswer.mockClear()
    })

    const triggerKeydown = (key: string) => {
        const event = new KeyboardEvent('keydown', { key })
        window.dispatchEvent(event)
    }

    it('submits answer when pressing valid number keys during practicing', () => {
        const state = {
            status: 'practicing' as const,
            currentIndex: 0,
            sessionQueue: [
                { type: 'single' as const, options: ['A', 'B', 'C', 'D'] }
            ]
        }
        
        renderHook(() => useKeyboardShortcuts(state, mockSubmitAnswer))

        triggerKeydown('1')
        expect(mockSubmitAnswer).toHaveBeenCalledWith('A')

        triggerKeydown('3')
        expect(mockSubmitAnswer).toHaveBeenCalledWith('C')
    })

    it('ignores input when not practicing', () => {
        const state = {
            status: 'reviewing' as const,
            currentIndex: 0,
            sessionQueue: [
                { type: 'single' as const, options: ['A', 'B', 'C', 'D'] }
            ]
        }
        
        renderHook(() => useKeyboardShortcuts(state, mockSubmitAnswer))

        triggerKeydown('1')
        expect(mockSubmitAnswer).not.toHaveBeenCalled()
    })

    it('ignores input for multi choice questions', () => {
        const state = {
            status: 'practicing' as const,
            currentIndex: 0,
            sessionQueue: [
                { type: 'multi' as const, options: ['A', 'B', 'C', 'D'] }
            ]
        }
        
        renderHook(() => useKeyboardShortcuts(state, mockSubmitAnswer))

        triggerKeydown('1')
        expect(mockSubmitAnswer).not.toHaveBeenCalled()
    })

    it('ignores input out of bounds of options length', () => {
        const state = {
            status: 'practicing' as const,
            currentIndex: 0,
            sessionQueue: [
                { type: 'boolean' as const, options: ['True', 'False'] }
            ]
        }
        
        renderHook(() => useKeyboardShortcuts(state, mockSubmitAnswer))

        triggerKeydown('3') // Out of bounds for 2 options
        expect(mockSubmitAnswer).not.toHaveBeenCalled()

        triggerKeydown('1') // Valid
        expect(mockSubmitAnswer).toHaveBeenCalledWith('A')
    })
    
    it('cleans up event listeners on unmount', () => {
        const state = {
            status: 'practicing' as const,
            currentIndex: 0,
            sessionQueue: [
                { type: 'single' as const, options: ['A', 'B', 'C', 'D'] }
            ]
        }
        
        const { unmount } = renderHook(() => useKeyboardShortcuts(state, mockSubmitAnswer))
        unmount()

        // After unmount, dispatching event should do nothing
        triggerKeydown('1')
        expect(mockSubmitAnswer).not.toHaveBeenCalled()
    })
})
